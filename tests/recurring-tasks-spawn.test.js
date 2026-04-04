require("./helpers/setup");
const test = require("node:test");
const assert = require("node:assert");
const { initDatabase, queryOne, queryAll, execute } = require("../database");
const { app } = require("../server");
const request = require("supertest");
const { signAuthToken } = require("../middleware/requireTeacher");
const { ensureRbacBootstrap } = require("../lib/rbac");
const { runRecurringTaskSpawnJob } = require("../lib/recurringTasks");
const { setSetting } = require("../lib/settings");

test.before(async () => {
  await initDatabase();
  await ensureRbacBootstrap();
});

async function getAdminAuthToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || "").trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id);
  assert.ok(adminRole?.id);
  const requiredPermissions = [
    "tasks.manage",
    "tasks.validate",
    "teacher.access",
  ];
  for (const key of requiredPermissions) {
    await execute(
      "INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)",
      [key, key, "Permission auto-seed tests recurring"]
    );
    await execute(
      "INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, 1)",
      [adminRole.id, key]
    );
  }
  await execute("UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?", [
    "teacher",
    teacher.id,
  ]);
  await execute(
    "INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1",
    ["teacher", teacher.id, adminRole.id]
  );
  return await signAuthToken(
    {
      userType: "teacher",
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: "admin",
      roleDisplayName: "Administrateur",
      elevated: false,
    },
    false
  );
}


test("Job recurrence : clone sans assignations et idempotence", async () => {
  const teacherToken = await getAdminAuthToken();
  const zones = await request(app).get("/api/zones").expect(200);
  const zoneId = zones.body[0]?.id || "pg";

  const title = `RecSpawn ${Date.now()}`;
  const taskRes = await request(app)
    .post("/api/tasks")
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({
      title,
      zone_id: zoneId,
      required_students: 1,
      recurrence: "weekly",
      start_date: "2020-01-01",
      due_date: "2020-01-08",
    })
    .expect(201);
  const taskId = taskRes.body.id;

  const studentRes = await request(app)
    .post("/api/auth/register")
    .send({
      firstName: "Rec",
      lastName: `Stu${Date.now()}`,
      password: "pass1234",
    })
    .expect(201);
  const { id: studentId, first_name: firstName, last_name: lastName } = studentRes.body;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ firstName, lastName, studentId })
    .expect(200);
  await request(app)
    .post(`/api/tasks/${taskId}/done`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ firstName, lastName, studentId })
    .expect(200);
  await request(app)
    .post(`/api/tasks/${taskId}/validate`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .expect(200);

  const sourceAfterValidate = await queryOne(
    "SELECT map_id, recurrence_template_zone_ids, recurrence_template_marker_ids FROM tasks WHERE id = ?",
    [taskId]
  );
  assert.ok(sourceAfterValidate?.recurrence_template_zone_ids, "snapshot zones attendu après validation récurrente");
  const templateZones = JSON.parse(sourceAfterValidate.recurrence_template_zone_ids);
  assert.ok(Array.isArray(templateZones) && templateZones.includes(zoneId), "zoneId dans le snapshot template");

  const r1 = await runRecurringTaskSpawnJob({ force: true });
  assert.strictEqual(r1.skipped, false);
  const children1 = await queryAll("SELECT id FROM tasks WHERE parent_task_id = ?", [taskId]);
  assert.strictEqual(children1.length, 1, `attendu 1 enfant pour cette tache, cree au total: ${r1.created.length}`);
  const childId = children1[0].id;

  const child = await queryOne("SELECT * FROM tasks WHERE id = ?", [childId]);
  assert.ok(child);
  assert.strictEqual(child.status, "available");
  assert.strictEqual(child.due_date, "2020-01-15");
  assert.strictEqual(child.start_date, "2020-01-08");
  assert.strictEqual(String(child.parent_task_id || ""), String(taskId));
  assert.strictEqual(child.recurrence, "weekly");

  const assigns = await queryAll("SELECT * FROM task_assignments WHERE task_id = ?", [childId]);
  assert.strictEqual(assigns.length, 0);

  const childZones = await queryAll("SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id", [childId]);
  assert.deepStrictEqual(
    childZones.map((r) => r.zone_id),
    templateZones.slice().sort()
  );
  const childMarkers = await queryAll("SELECT marker_id FROM task_markers WHERE task_id = ? ORDER BY marker_id", [childId]);
  assert.deepStrictEqual(
    childMarkers.map((r) => r.marker_id),
    JSON.parse(sourceAfterValidate.recurrence_template_marker_ids || "[]").slice().sort()
  );
  assert.strictEqual(child.map_id, sourceAfterValidate.map_id);

  const source = await queryOne("SELECT recurrence_spawned_for_due_date FROM tasks WHERE id = ?", [taskId]);
  assert.strictEqual(source.recurrence_spawned_for_due_date, "2020-01-08");

  const r2 = await runRecurringTaskSpawnJob({ force: true });
  const children2 = await queryAll("SELECT id FROM tasks WHERE parent_task_id = ?", [taskId]);
  assert.strictEqual(children2.length, 1);
});

test("Utilitaires dates : +1 mois fin de mois", async () => {
  const { addMonthsToDateString } = require("../lib/recurringTasks");
  assert.strictEqual(addMonthsToDateString("2026-01-31", 1), "2026-02-28");
});

test("Réglage global récurrence : désactive auto, force conserve le rattrapage manuel", async () => {
  const teacherToken = await getAdminAuthToken();
  const zones = await request(app).get("/api/zones").expect(200);
  const zoneId = zones.body[0]?.id || "pg";
  const titleBase = `RecSetting ${Date.now()}`;
  const sourceDueDate = "2020-01-08";

  const createValidatedRecurringTask = async (title) => {
    const created = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        title,
        zone_id: zoneId,
        required_students: 1,
        recurrence: "weekly",
        start_date: "2020-01-01",
        due_date: sourceDueDate,
      })
      .expect(201);
    await request(app)
      .post(`/api/tasks/${created.body.id}/validate`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(200);
    return created.body.id;
  };

  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    await setSetting("tasks.recurring_automation_enabled", false, { userType: "teacher", userId: "test-recurring" });

    const taskIdNoForce = await createValidatedRecurringTask(`${titleBase}-noforce`);
    const skippedRun = await runRecurringTaskSpawnJob({ force: false });
    assert.strictEqual(skippedRun.skipped, true);
    assert.strictEqual(skippedRun.reason, "recurring_automation_disabled");
    const childrenNoForce = await queryAll("SELECT id FROM tasks WHERE parent_task_id = ?", [taskIdNoForce]);
    assert.strictEqual(childrenNoForce.length, 0);

    const taskIdForce = await createValidatedRecurringTask(`${titleBase}-force`);
    const forcedRun = await runRecurringTaskSpawnJob({ force: true });
    assert.strictEqual(forcedRun.skipped, false);
    const childrenForce = await queryAll("SELECT id FROM tasks WHERE parent_task_id = ?", [taskIdForce]);
    assert.strictEqual(childrenForce.length, 1);
    const childRow = await queryOne("SELECT id, map_id, zone_id FROM tasks WHERE parent_task_id = ? LIMIT 1", [
      taskIdForce,
    ]);
    const parentRow = await queryOne(
      "SELECT map_id, recurrence_template_zone_ids FROM tasks WHERE id = ?",
      [taskIdForce]
    );
    const tmpl = JSON.parse(parentRow.recurrence_template_zone_ids || "[]");
    const cz = await queryAll("SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id", [childRow.id]);
    assert.deepStrictEqual(cz.map((r) => r.zone_id), tmpl.slice().sort());
    assert.strictEqual(childRow.map_id, parentRow.map_id);
    assert.strictEqual(childRow.zone_id, tmpl[0] || null);
  } finally {
    await setSetting("tasks.recurring_automation_enabled", true, { userType: "teacher", userId: "test-recurring" });
    process.env.NODE_ENV = originalNodeEnv;
  }
});
