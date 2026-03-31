require("dotenv").config();
const { initSchema } = require("../database");
const { runRecurringTaskSpawnJob } = require("../lib/recurringTasks");

(async () => {
  try {
    await initSchema();
    const r = await runRecurringTaskSpawnJob({ force: true });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.errors && r.errors.length ? 1 : 0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
