// ============================================================
// EngLand CRM — слой данных (Supabase)
// ============================================================
let DB = {
  users: {},
  teachers: [],
  groups: [],
  students: [],
  lessons: [],
  attendance: {},
  payments: [],
  homework: [],
  feedback: [],
};

let dbReadyResolve;
const dbReady = new Promise(resolve => { dbReadyResolve = resolve; });

// ---------- ЗАГРУЗКА ВСЕХ ДАННЫХ ИЗ SUPABASE ----------
async function loadAllFromSupabase() {
  const [
    usersRes, teachersRes, groupsRes, studentsRes,
    lessonsRes, attendanceRes, paymentsRes, homeworkRes, feedbackRes
  ] = await Promise.all([
    supabaseClient.from("users").select("*"),
    supabaseClient.from("teachers").select("*"),
    supabaseClient.from("groups").select("*"),
    supabaseClient.from("students").select("*"),
    supabaseClient.from("lessons").select("*"),
    supabaseClient.from("attendance").select("*"),
    supabaseClient.from("payments").select("*"),
    supabaseClient.from("homework").select("*"),
    supabaseClient.from("feedback").select("*"),
  ]);

  const usersObj = {};
  (usersRes.data || []).forEach(u => {
    usersObj[u.login] = {
      password: u.password,
      role: u.role,
      name: u.name,
      id: u.teacher_id || u.login,
      studentIds: u.student_ids || [],
    };
  });

  const attendanceObj = {};
  (attendanceRes.data || []).forEach(a => {
    if (!attendanceObj[a.lesson_id]) attendanceObj[a.lesson_id] = {};
    attendanceObj[a.lesson_id][a.student_id] = a.status;
  });

  DB.users = usersObj;
  DB.teachers = teachersRes.data || [];
  DB.groups = (groupsRes.data || []).map(g => ({ ...g, teacherId: g.teacher_id }));
  DB.students = (studentsRes.data || []).map(s => ({
    ...s,
    groupId: s.group_id,
    parentId: s.parent_login,
    subscriptionTotal: s.subscription_total,
    subscriptionUsed: s.subscription_used,
    lastPaymentDate: s.last_payment_date,
    nextPaymentDate: s.next_payment_date,
    paymentAmount: s.payment_amount,
  }));
  DB.lessons = (lessonsRes.data || []).map(l => ({ ...l, groupId: l.group_id }));
  DB.attendance = attendanceObj;
  DB.payments = paymentsRes.data || [];
  DB.homework = (homeworkRes.data || []).map(h => ({ ...h, studentId: h.student_id, groupId: h.group_id }));
  DB.feedback = (feedbackRes.data || []).map(f => ({ ...f, studentId: f.student_id, teacherId: f.teacher_id }));
}

// ---------- REALTIME ----------
function subscribeToRealtimeUpdates(onChange) {
  const tables = ["students", "lessons", "attendance", "payments", "homework", "feedback"];
  const channel = supabaseClient.channel("crm-changes");
  tables.forEach(table => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, async () => {
      await loadAllFromSupabase();
      onChange();
    });
  });
  channel.subscribe();
}

// ---------- ЗАПИСЬ ДАННЫХ ----------
async function dbRenewSubscription(studentId, lessons, amount) {
  const student = DB.students.find(s => s.id === studentId);
  const newTotal = student.subscriptionUsed + lessons;
  const today = new Date().toISOString().slice(0, 10);
  const next = new Date();
  next.setDate(next.getDate() + 30);
  const nextStr = next.toISOString().slice(0, 10);

  await supabaseClient.from("students").update({
    subscription_total: newTotal,
    last_payment_date: today,
    next_payment_date: nextStr,
  }).eq("id", studentId);

  await supabaseClient.from("payments").insert({
    id: "pay" + Date.now(),
    student_id: studentId,
    date: today,
    amount,
    lessons,
  });
  await loadAllFromSupabase();
}

async function dbMarkAttendance(lessonId, studentId, status) {
  const current = DB.attendance[lessonId] && DB.attendance[lessonId][studentId];
  if (current === status) {
    await supabaseClient.from("attendance").delete()
      .eq("lesson_id", lessonId).eq("student_id", studentId);
  } else {
    await supabaseClient.from("attendance").upsert({
      lesson_id: lessonId, student_id: studentId, status
    }, { onConflict: "lesson_id,student_id" });
    
    if (status === "present" && current !== "present") {
      const s = DB.students.find(st => st.id === studentId);
      if (s) {
        await supabaseClient.from("students").update({
          subscription_used: Math.min(s.subscriptionUsed + 1, s.subscriptionTotal + 5)
        }).eq("id", studentId);
      }
    }
  }
  await supabaseClient.from("lessons").update({ status: "completed" }).eq("id", lessonId);
  await loadAllFromSupabase();
}

async function dbAddLesson(groupId, date, topic) {
  await supabaseClient.from("lessons").insert({
    id: "l" + Date.now(), group_id: groupId, date, topic, status: "upcoming"
  });
  await loadAllFromSupabase();
}

async function dbAddHomework(studentId, groupId, text) {
  const today = new Date().toISOString().slice(0, 10);
  await supabaseClient.from("homework").insert({
    id: "hw" + Date.now(), student_id: studentId, group_id: groupId,
    date: today, text, status: "assigned"
  });
  await loadAllFromSupabase();
}

async function dbAddFeedback(studentId, teacherId, text) {
  const today = new Date().toISOString().slice(0, 10);
  await supabaseClient.from("feedback").insert({
    id: "f" + Date.now(), student_id: studentId, date: today, teacher_id: teacherId, text
  });
  await loadAllFromSupabase();
}