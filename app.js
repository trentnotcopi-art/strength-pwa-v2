// ─── Глобальные ссылки ───────────────────────────────────────────────────────
const app       = document.querySelector("#app");
const navButtons = [...document.querySelectorAll(".nav-btn")];
const store      = window.strengthDb;

if (!Array.isArray(window.exerciseTemplates) || !window.exerciseTemplates.length) {
  throw new Error("Не загрузился файл data/exerciseTemplates.js. Проверь, что папка data попала в репозиторий, затем обнови страницу через Ctrl+F5.");
}

const templates  = window.exerciseTemplates;

// ─── Утилита безопасного HTML ────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Состояние ───────────────────────────────────────────────────────────────
const savedProfile = store.getSetting("profile") || {};
if (!["male", "female"].includes(savedProfile.sex)) savedProfile.sex = "male";

const state = {
  route:           "home",
  activeSession:   null,
  activeExerciseId: null,
  selectedDay:     "A",
  wellbeing:       "нормально",
  weight:          30,
  reps:            8,
  technique:       "clean",
  pain:            false,
  measure:         { height: "", bodyWeight: "", arm: "", chest: "", waist: "", notes: "" },
  profile:         { age: "", sex: "male", completed: false, ...savedProfile },
  legsUnlocked:    store.getSetting("legsUnlocked") ?? false,
  pendingImport:   null,
};

// ─── Справочники ─────────────────────────────────────────────────────────────
const DAY_NAMES = {
  A: "День A · Грудь + Бицепс",
  B: "День B · Спина + Трицепс",
  C: "День C · Ноги + тяжёлый жим + плечи",
};
const DAY_NAMES_SHORT = { A: "Грудь + Бицепс", B: "Спина + Трицепс", C: "Ноги + жим + плечи" };

const STATUS_LABELS = {
  none:      "нет данных",
  probe:     "пробный",
  working:   "рабочий",
  confirmed: "закреплённый",
};

const PLANNER_WAVES = [
  { label: "Вход", sets: 3, mainReps: 12, dropReps: [12, 8], load: 0 },
  { label: "Проработка", sets: 4, mainReps: 10, dropReps: [10, 6], load: 0 },
  { label: "Закрепление", sets: 4, mainReps: 10, dropReps: [10, 8], load: 0 },
  { label: "Пик объёма", sets: 4, mainReps: 12, dropReps: [12, 8], load: 0 },
];
const PLANNER_MONTHS = 6;
const TRAINING_DAYS_PER_WEEK = 3;
const TRAINING_DAYS_TOTAL = PLANNER_MONTHS * 4 * TRAINING_DAYS_PER_WEEK;

// ─── PWA: регистрация service worker ─────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

// Просим браузер не вытеснять IndexedDB при нехватке места (на iOS — no-op, там
// установленная PWA и так живёт, пока иконка на экране «Домой»)
navigator.storage?.persist?.().catch(() => {});

// ─── Навигация ────────────────────────────────────────────────────────────────
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.route));
});

window.addEventListener("hashchange", () => {
  state.route = location.hash.replace("#", "") || "home";
  render();
});

function navigate(route) {
  // Рендер делает обработчик hashchange; прямой вызов нужен,
  // только если hash уже совпадает и события не будет.
  if (location.hash === `#${route}`) {
    state.route = route;
    render();
  } else {
    location.hash = route;
  }
}

function setActiveNav() {
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === state.route);
  });
}

// ─── Делегирование событий ───────────────────────────────────────────────────
document.addEventListener("click", async (e) => {
  const action = e.target.closest("[data-action]");
  if (!action) return;
  const { action: name } = action.dataset;

  if (name === "choose-day")      chooseDay(action.dataset.day);
  if (name === "continue-workout") await continueWorkout(Number(action.dataset.id));
  if (name === "set-wellbeing")   setState("wellbeing", action.dataset.value);
  if (name === "start-session")   await startSession();
  if (name === "open-exercise")   openExercise(action.dataset.id);
  if (name === "finish-session")  await finishSession();
  if (name === "save-set")        await saveSet();
  if (name === "set-technique")   setState("technique", action.dataset.value);
  if (name === "set-pain")        setState("pain", action.dataset.value === "true");
  if (name === "open-session")    await renderSessionDetails(Number(action.dataset.id));
  if (name === "back-workout")    navigate("workout");
  if (name === "back-history")    navigate("history");
  if (name === "new-workout")     navigate("select");
  if (name === "toggle-legs")     toggleLegs();
  if (name === "go-home")         navigate("home");
  if (name === "use-plan-step")    usePlanStep(action);
  if (name === "delete-session" && confirmDangerTap(action)) await deleteSessionFromHistory(Number(action.dataset.id));
  if (name === "set-measure")      setMeasure(action.dataset.key, action.dataset.value);
  if (name === "save-measure")     await saveMeasurement();
  if (name === "delete-measure" && confirmDangerTap(action)) await deleteMeasurement(Number(action.dataset.id));
  if (name === "reset-planner")    await resetPlanner();
  if (name === "set-sex")          setProfile("sex", action.dataset.value);
  if (name === "save-profile")     await saveProfile();
  if (name === "share-session-report") await shareSessionReport(Number(action.dataset.id));
  if (name === "export-backup")    await exportBackup();
  if (name === "import-backup")    pickImportFile();
  if (name === "confirm-import")   await confirmImport();
  if (name === "cancel-import")    { state.pendingImport = null; render(); }
});

document.addEventListener("input", (e) => {
  const input = e.target.closest("[data-measure-input]");
  if (input) state.measure[input.dataset.measureInput] = input.value;
  const profileInput = e.target.closest("[data-profile-input]");
  if (profileInput) setProfile(profileInput.dataset.profileInput, profileInput.value);
});

document.addEventListener("click", (e) => {
  const counter = e.target.closest("[data-counter]");
  const btn     = e.target.closest(".counter-btn");
  if (!counter || !btn) return;

  const key  = counter.dataset.counter;
  const step = Number(btn.dataset.step);
  const unit = key === "weight" ? getActiveWeightStep() : 1;
  const min  = key === "weight" ? getActiveMinWeight() : 1;
  state[key] = Math.max(min, roundToWeightStep(state[key] + step * unit, unit));
  render();
});

// Двухтаповое подтверждение удаления: первый тап «взводит» кнопку («Точно?»),
// второй в течение 3 секунд выполняет действие. Без второго тапа — откат.
function confirmDangerTap(button) {
  if (button.dataset.armed === "1") return true;
  const original = button.textContent;
  button.dataset.armed = "1";
  button.textContent = "Точно?";
  button.classList.add("armed");
  setTimeout(() => {
    if (!button.isConnected) return;
    button.dataset.armed = "";
    button.textContent = original;
    button.classList.remove("armed");
  }, 3000);
  return false;
}

// ─── Хелперы состояния ───────────────────────────────────────────────────────
function setState(key, value) {
  state[key] = value;
  render();
}

function chooseDay(day) {
  // День C с заблокированными ногами разрешён: остаются тяжёлый жим, махи и заминка.
  state.selectedDay = day;
  render();
}

function toggleLegs() {
  state.legsUnlocked = !state.legsUnlocked;
  store.setSetting("legsUnlocked", state.legsUnlocked);
  // Обновляем blocked в шаблонах runtime
  templates
    .filter((t) => t.muscleGroup === "Ноги")
    .forEach((t) => { t.blocked = !state.legsUnlocked; });
  render();
}

// ─── Сессии ──────────────────────────────────────────────────────────────────
function isToday(value) {
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

async function startSession() {
  // Если сегодня уже есть незавершённый черновик этого же дня — продолжаем его,
  // а не плодим вторую сессию
  const sessions = await store.getAllSessions();
  const draft = sessions.find(
    (s) => !s.completed && isToday(s.date) && s.dayType === state.selectedDay,
  );
  const session = draft || await store.createSession(state.selectedDay, state.wellbeing);
  state.activeSession = session;
  await ensurePlannerForSession(session);
  if (draft) window.exportUtils.showToast("Продолжаем сегодняшнюю тренировку");
  navigate("workout");
}

async function continueWorkout(sessionId) {
  const session = await store.getSession(sessionId);
  if (!session || session.completed) return;
  state.activeSession = session;
  await ensurePlannerForSession(session);
  navigate("workout");
}

async function finishSession() {
  if (!state.activeSession) return;
  const finishedId = state.activeSession.id;
  await store.completeSession(finishedId);
  const planner = await advancePlannerAfterSession(finishedId);
  state.activeSession   = null;
  state.activeExerciseId = null;
  // Экран-резюме завершённой тренировки — оттуда можно сразу поделиться отчётом.
  // replaceState вместо location.hash, чтобы hashchange не перерисовал экран историей.
  state.route = "history";
  history.replaceState(null, "", "#history");
  setActiveNav();
  try {
    await renderFinishSummary(finishedId, planner);
  } catch (err) {
    renderError(err);
  }
}

async function renderFinishSummary(sessionId, planner) {
  const session = await store.getSession(sessionId);
  const sets = await store.getSessionSets(sessionId);
  const exercisesDone = new Set(sets.map((s) => s.exerciseId)).size;
  const painCount = sets.filter((s) => s.pain).length;
  const cleanCount = sets.filter((s) => s.technique === "clean" && !s.pain).length;

  app.innerHTML = `
    <section class="screen">
      <article class="card cta-card summary-card">
        <p class="eyebrow">Готово</p>
        <h1>Тренировка завершена 💪</h1>
        <p class="muted">${DAY_NAMES[session.dayType]} · ${formatDate(session.date)}</p>
        <div class="summary-stats">
          <div><strong>${sets.length}</strong><span class="label">${plural(sets.length, "подход", "подхода", "подходов")}</span></div>
          <div><strong>${exercisesDone}</strong><span class="label">${plural(exercisesDone, "упражнение", "упражнения", "упражнений")}</span></div>
          <div><strong>${cleanCount}</strong><span class="label">чисто</span></div>
        </div>
        ${painCount ? `<div class="warn">⚠ Была боль в ${painCount} ${plural(painCount, "подходе", "подходах", "подходах")} — посмотри рекомендации в Отчёте.</div>` : ""}
        <p class="muted">${esc(planner?.lastAdvice || "")}</p>
        <button class="primary-btn" data-action="share-session-report" data-id="${session.id}">
          Поделиться отчётом
        </button>
        <button class="secondary-btn" data-action="go-home">Домой</button>
      </article>
    </section>`;
}

function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function openExercise(exerciseId) {
  const tmpl = getTemplate(exerciseId);
  state.activeExerciseId = exerciseId;
  state.weight    = getPlannedWeight(tmpl);
  state.reps      = getPlannedReps(tmpl);
  state.technique = "clean";
  state.pain      = false;
  navigate("exercise");
}

function usePlanStep(action) {
  state.weight = Number(action.dataset.weight);
  state.reps = Number(action.dataset.reps);
  render();
}

async function deleteSessionFromHistory(sessionId) {
  await store.deleteSession(sessionId);
  await rebuildWorkingBases();
  await renderHistory();
}

// ─── Сохранение подхода ───────────────────────────────────────────────────────
async function saveSet() {
  if (!state.activeSession || !state.activeExerciseId) return;
  const existing  = await store.getSessionSets(state.activeSession.id);
  const setNumber = existing.filter((s) => s.exerciseId === state.activeExerciseId).length + 1;

  const saved = await store.addSetLog({
    sessionId:   state.activeSession.id,
    exerciseId:  state.activeExerciseId,
    setNumber,
    weight:      state.weight,
    reps:        state.reps,
    technique:   state.technique,
    pain:        state.pain,
    painNote:    state.pain ? "Боль отмечена во время подхода" : "",
  });

  await updateWorkingBase(saved);
  const tmpl = getTemplate(state.activeExerciseId);

  // Все плановые подходы сделаны — возвращаемся к списку упражнений
  if (setNumber >= getPlannedSets(tmpl)) {
    window.exportUtils.showToast(`${tmpl?.name || "Упражнение"}: выполнено ✓`);
    state.pain = false;
    navigate("workout");
    return;
  }

  // Подставляем плановые повторы следующего подхода (для дроп-сетов они меняются)
  state.reps = Number(tmpl?.planReps?.[setNumber] ?? tmpl?.planReps?.[0] ?? state.reps);
  state.pain = false;
  render();
}

async function updateWorkingBase(setLog) {
  const tmpl = getTemplate(setLog.exerciseId);
  if (!tmpl || tmpl.blocked) return;
  if (setLog.pain) return;

  const previous     = await store.getWorkingBase(setLog.exerciseId);
  const previousWeight = previous?.weight || 0;
  const nextWeight   = Math.max(previousWeight, Number(setLog.weight));

  if (setLog.technique === "cheating") {
    await store.upsertWorkingBase({
      exerciseId:        setLog.exerciseId,
      weight:            nextWeight,
      status:            previous?.status === "confirmed" ? "confirmed" : "probe",
      sessionsConfirmed: previous?.sessionsConfirmed || 0,
      lastUpdated:       new Date().toISOString(),
    });
    return;
  }

  const allSets = await store.getAllSets();
  const cleanSessionIds = new Set(
    allSets
      .filter(
        (s) =>
          s.exerciseId === setLog.exerciseId &&
          !s.pain &&
          s.technique === "clean" &&
          Number(s.weight) >= nextWeight,
      )
      .map((s) => s.sessionId),
  );

  const sessionsConfirmed = cleanSessionIds.size;
  const status = sessionsConfirmed >= 2 ? "confirmed" : "working";
  await store.upsertWorkingBase({
    exerciseId: setLog.exerciseId,
    weight:     nextWeight,
    status,
    sessionsConfirmed,
    lastUpdated: new Date().toISOString(),
  });
}

async function rebuildWorkingBases() {
  const allSets = await store.getAllSets();
  const byExercise = new Map();

  allSets.forEach((set) => {
    const tmpl = getTemplate(set.exerciseId);
    // blocked скрывает упражнение в UI, но не должен стирать накопленные базы
    if (!tmpl || set.pain) return;
    const items = byExercise.get(set.exerciseId) || [];
    items.push(set);
    byExercise.set(set.exerciseId, items);
  });

  const bases = [];
  byExercise.forEach((sets, exerciseId) => {
    const maxWeight = Math.max(...sets.map((set) => Number(set.weight) || 0));
    if (!maxWeight) return;
    const cleanSessionIds = new Set(
      sets
        .filter(
          (set) =>
            set.technique === "clean" &&
            !set.pain &&
            Number(set.weight) >= maxWeight,
        )
        .map((set) => set.sessionId),
    );
    const hasCheatingAtMax = sets.some(
      (set) => set.technique === "cheating" && Number(set.weight) >= maxWeight,
    );
    bases.push({
      exerciseId,
      weight: maxWeight,
      status: cleanSessionIds.size >= 2 ? "confirmed" : hasCheatingAtMax ? "probe" : "working",
      sessionsConfirmed: cleanSessionIds.size,
      lastUpdated: new Date().toISOString(),
    });
  });

  await store.replaceWorkingBases(bases);
}

async function getPlanner() {
  const stored = await store.getPlannerState();
  if (stored) return stored;
  const created = {
    startedAt: new Date().toISOString(),
    index: 0,
    waveIndex: 0,
    cycle: 1,
    lastAdvice: "Стартуем с входной волны и двигаемся по A/B/C.",
  };
  await store.setPlannerState(created);
  return created;
}

async function ensurePlannerForSession(session) {
  const planner = await getPlanner();
  if (planner.currentSessionId === session.id) return planner;
  const dayIndex = getDayIndex(session.dayType);
  const waveIndex = Math.floor(planner.index / 3) % PLANNER_WAVES.length;
  const cycle = Math.floor(planner.index / (PLANNER_WAVES.length * 3)) + 1;
  const current = {
    ...planner,
    currentSessionId: session.id,
    currentDay: session.dayType,
    currentDayIndex: dayIndex,
    waveIndex,
    cycle,
  };
  await store.setPlannerState(current);
  applyPlannerToTemplates(current);
  return current;
}

async function advancePlannerAfterSession(sessionId) {
  const planner = await getPlanner();
  const sets = await store.getSessionSets(sessionId);
  const result = evaluateSessionResult(sets);
  const nextIndex = Math.min(TRAINING_DAYS_TOTAL - 1, planner.index + (result.advance ? 1 : 0));
  const next = {
    ...planner,
    index: nextIndex,
    currentSessionId: null,
    currentDay: null,
    waveIndex: Math.floor(nextIndex / 3) % PLANNER_WAVES.length,
    cycle: Math.floor(nextIndex / (PLANNER_WAVES.length * 3)) + 1,
    lastAdvice: result.advice,
  };
  await store.setPlannerState(next);
  return next;
}

async function resetPlanner() {
  await store.setPlannerState({
    startedAt: new Date().toISOString(),
    index: 0,
    waveIndex: 0,
    cycle: 1,
    lastAdvice: "План сброшен: начинаем новую входную волну.",
  });
  render();
}

function evaluateSessionResult(sets) {
  if (!sets.length) return { advance: false, advice: "Черновик без подходов: повтори эту тренировку." };
  if (sets.some((set) => set.pain)) {
    return { advance: false, advice: "Была боль: вес не повышать, повторить или облегчить тренировку." };
  }
  const cheating = sets.filter((set) => set.technique === "cheating").length;
  if (cheating > sets.length / 3) {
    return { advance: false, advice: "Много читинга: закрепи технику на этой же волне." };
  }
  return { advance: true, advice: "Тренировка принята: двигаемся к следующему дню/волне." };
}

function applyPlannerToTemplates(planner) {
  const wave = PLANNER_WAVES[planner.waveIndex || 0];
  templates.forEach((tmpl) => {
    const planned = buildExercisePlan(tmpl, wave, planner.cycle || 1, state.profile);
    tmpl.currentPlan = planned.text;
    tmpl.planWeights = planned.weights;
    tmpl.planReps = planned.reps;
    tmpl.planSets = wave.sets;
  });
}

function getPlannedSets(tmpl) {
  return Number(tmpl?.planSets) || 3;
}

function buildExercisePlan(tmpl, wave, cycle, profile = state.profile) {
  const source = tmpl.planWeights?.length ? tmpl.planWeights : [tmpl.peakWeight || tmpl.returnLevel1 || 0];
  const cycleStep = Math.max(0, cycle - 1);
  const modifier = getProfileModifier(profile);
  const effectiveStep = Math.floor(cycleStep * modifier.progressionRate);
  const weights = source.map((weight, index) => {
    if (!weight) return 0;
    const weightStep = getWeightStep(tmpl);
    const increment = index === 0 ? weightStep * effectiveStep : weightStep * Math.floor(effectiveStep / 2);
    return roundToWeightStep(Number(weight) + increment, weightStep);
  });
  const reps = tmpl.isDropSet ? normalizeDropReps(wave.dropReps, weights.length) : [wave.mainReps];
  const weightText = weights.length > 1 ? weights.join("/") : String(weights[0]);
  const repText = tmpl.isDropSet ? reps.join("/") : String(wave.mainReps);
  const unit = weights.some(Boolean) ? " кг" : "";
  return {
    weights,
    reps,
    text: `${weightText}${unit} x ${wave.sets}×${repText}`,
  };
}

function getProfileModifier(profile = state.profile) {
  const age = Number(profile?.age || 0);
  const sex = profile?.sex || "male";
  let progressionRate = sex === "female" ? 0.75 : 1;
  let recovery = sex === "female" ? "чуть осторожнее с повышением веса" : "стандартная прогрессия";
  if (age >= 45) {
    progressionRate *= 0.75;
    recovery = "повышать вес реже, больше внимания восстановлению";
  }
  if (age >= 55) {
    progressionRate *= 0.75;
    recovery = "консервативная прогрессия, не гнаться за пиками";
  }
  return { progressionRate, recovery };
}

function normalizeDropReps(reps, count) {
  const result = [...reps];
  while (result.length < count) result.push(result[result.length - 1] || 6);
  return result.slice(0, count);
}

function getDayIndex(day) {
  return { A: 0, B: 1, C: 2 }[day] || 0;
}

function setMeasure(key, value) {
  state.measure[key] = value;
}

function setProfile(key, value) {
  if (key === "sex" && !["male", "female"].includes(value)) return;
  if (key === "age") {
    const age = Math.trunc(Number(value));
    value = Number.isFinite(age) && age >= 10 && age <= 99 ? age : "";
  }
  state.profile = { ...state.profile, [key]: value };
  store.setSetting("profile", state.profile);
  if (key === "sex") render();
}

async function saveProfile() {
  state.profile = { ...state.profile, completed: true };
  store.setSetting("profile", state.profile);

  const hasMeasurement = ["height", "bodyWeight", "arm", "chest", "waist"].some(
    (key) => state.measure[key] !== "",
  );
  if (hasMeasurement) {
    const payload = {};
    ["height", "bodyWeight", "arm", "chest", "waist"].forEach((key) => {
      if (state.measure[key] !== "") payload[key] = Number(String(state.measure[key]).replace(",", "."));
    });
    await store.addBodyMeasurement({ ...payload, notes: "Стартовый профиль" });
    state.measure = { height: "", bodyWeight: "", arm: "", chest: "", waist: "", notes: "" };
  }

  render();
}

async function saveMeasurement() {
  const payload = {};
  Object.entries(state.measure).forEach(([key, value]) => {
    if (value === "") return;
    payload[key] = key === "notes" ? value : Number(String(value).replace(",", "."));
  });
  if (!Object.keys(payload).length) return;
  await store.addBodyMeasurement(payload);
  state.measure = { height: "", bodyWeight: "", arm: "", chest: "", waist: "", notes: "" };
  await renderProgress();
}

async function deleteMeasurement(id) {
  await store.deleteBodyMeasurement(id);
  await renderProgress();
}

function formatMeasure(value, unit) {
  return value ? `${value} ${unit}` : "—";
}

function formatDelta(current, previous, unit) {
  if (!current || !previous) return "нет сравнения";
  const delta = roundToHalf(Number(current) - Number(previous));
  if (!delta) return "без изменений";
  return `${delta > 0 ? "+" : ""}${delta} ${unit}`;
}

// ─── Главный роутер ──────────────────────────────────────────────────────────
async function render() {
  try {
    setActiveNav();
    if (state.route === "select")   return renderSelect();
    if (state.route === "workout")  return await renderWorkout();
    if (state.route === "exercise") return await renderExercise();
    if (state.route === "history")  return await renderHistory();
    if (state.route === "plan")     return await renderPlan();
    if (state.route === "progress") return await renderProgress();
    if (state.route === "report")   return await renderReport();
    if (state.route === "settings") return renderSettings();
    return await renderHome();
  } catch (err) {
    renderError(err);
  }
}

function renderError(err) {
  app.innerHTML = `
    <section class="screen">
      <article class="card">
        <p class="eyebrow warn-text">Ошибка</p>
        <h1>Что-то пошло не так</h1>
        <p class="muted">${esc(err.message)}</p>
        <button class="primary-btn" onclick="location.reload()">Перезагрузить</button>
      </article>
    </section>`;
  console.error(err);
}

// ─── Главный экран ────────────────────────────────────────────────────────────
async function renderHome() {
  const sessions = await store.getAllSessions();
  const measurements = await store.getBodyMeasurements();
  const planner  = await getPlanner();
  applyPlannerToTemplates(planner);
  const last     = sessions[0];
  const nextDay  = getNextDay(last);
  const draft    = sessions.find((s) => !s.completed && isToday(s.date));

  app.innerHTML = `
    <section class="screen">
      <div class="home-header">
        <div>
          <p class="eyebrow">Возврат к форме</p>
          <h1>Сегодня по плану</h1>
        </div>
        <button class="icon-btn" data-action="go-settings" aria-label="Настройки">⚙</button>
      </div>

      <article class="card cta-card">
        <div class="metric-row">
          <div>
            <p class="label">${draft ? "Не завершена" : "Следующая"}</p>
            <h2>${DAY_NAMES[draft ? draft.dayType : nextDay]}</h2>
          </div>
          ${draft ? `<span class="status warn">черновик</span>` : ""}
        </div>
        ${draft
          ? `<button class="primary-btn" data-action="continue-workout" data-id="${draft.id}">Продолжить тренировку</button>`
          : `<button class="primary-btn" data-action="new-workout">Начать тренировку</button>`}
      </article>

      ${renderProgramPlan(nextDay)}

      <article class="card soft planner-card">
        <div class="metric-row">
          <div>
            <p class="label">Автопланировщик</p>
            <h3>Цикл ${planner.cycle || 1} · ${PLANNER_WAVES[planner.waveIndex || 0].label}</h3>
          </div>
          <span class="status work">${(planner.index || 0) + 1} / ${TRAINING_DAYS_TOTAL}</span>
        </div>
        <p class="muted">${esc(planner.lastAdvice || "Двигаемся по плану A/B/C.")}</p>
        <button class="secondary-btn compact-btn" data-action="reset-planner">Сбросить цикл</button>
      </article>

      ${renderMeasureReminder(measurements)}

      ${last ? `
      <article class="card soft">
        <p class="label">Последняя тренировка</p>
        <div class="metric-row" style="margin-top:6px">
          <div>
            <h3>${formatDate(last.date)}</h3>
            <p class="muted">${DAY_NAMES_SHORT[last.dayType]} · ${esc(last.wellbeing)}</p>
          </div>
          <span class="status ${last.completed ? "good" : "warn"}">${last.completed ? "готово" : "черновик"}</span>
        </div>
      </article>` : `
      <article class="card soft">
        <p class="empty">Тренировок пока нет. Начни первую!</p>
      </article>`}

      <div class="week-strip">
        ${renderWeekStrip(sessions)}
      </div>

      <div class="grid-2">
        <button class="secondary-btn" data-action="go-history">История</button>
        <button class="secondary-btn" data-action="go-progress">Прогресс</button>
      </div>
      ${state.profile.completed ? "" : renderProfileOnboarding()}
    </section>`;

  // inline navigation для secondary кнопок главного экрана
  app.querySelectorAll("[data-action='go-history']").forEach((b) =>
    b.addEventListener("click", () => navigate("history")));
  app.querySelectorAll("[data-action='go-progress']").forEach((b) =>
    b.addEventListener("click", () => navigate("progress")));
  app.querySelectorAll("[data-action='go-settings']").forEach((b) =>
    b.addEventListener("click", () => navigate("settings")));
}

function renderMeasureReminder(measurements) {
  const latest = measurements[0];
  const stale = !latest || Date.now() - new Date(latest.date).getTime() > 7 * 24 * 60 * 60 * 1000;
  if (!stale) {
    return `
      <article class="card soft">
        <p class="label">Замеры</p>
        <p class="muted">Последний замер: ${formatDate(latest.date)} · ${renderMeasurementLine(latest)}</p>
      </article>`;
  }
  return `
    <article class="warn">
      <strong>Пора сделать замеры</strong>
      <p>Вес, руки-базуки, грудь и талия. Запиши их в разделе «Прогресс».</p>
    </article>`;
}

function renderProfileOnboarding() {
  return `
    <div class="modal-backdrop">
      <article class="card profile-modal">
        <div>
          <p class="eyebrow">Профиль</p>
          <h1>Основные параметры</h1>
        </div>
        <div class="profile-grid">
          <label class="measure-input">
            <span class="label">Возраст</span>
            <input type="number" inputmode="numeric" min="10" max="99" data-profile-input="age" value="${esc(state.profile.age)}" placeholder="лет" />
          </label>
          <div class="measure-input">
            <span class="label">Пол</span>
            <div class="chip-row">
              <button class="chip ${state.profile.sex === "male" ? "active" : ""}" data-action="set-sex" data-value="male">муж</button>
              <button class="chip ${state.profile.sex === "female" ? "active" : ""}" data-action="set-sex" data-value="female">жен</button>
            </div>
          </div>
        </div>
        <div class="measure-grid">
          ${renderMeasureInput("height", "Рост", "см")}
          ${renderMeasureInput("bodyWeight", "Вес", "кг")}
          ${renderMeasureInput("arm", "Руки-базуки", "см")}
          ${renderMeasureInput("chest", "Грудь", "см")}
          ${renderMeasureInput("waist", "Талия", "см")}
        </div>
        <button class="primary-btn" data-action="save-profile">Сохранить профиль</button>
      </article>
    </div>`;
}

// ─── Полоса недели ────────────────────────────────────────────────────────────
function renderWeekStrip(sessions) {
  const now   = new Date();
  const days  = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const today = (now.getDay() + 6) % 7; // 0=Пн

  return `<div class="week-row">
    ${days.map((label, i) => {
      const isToday = i === today;
      const hasSession = sessions.some((s) => {
        const d = new Date(s.date);
        const weekday = (d.getDay() + 6) % 7;
        // только эта неделя
        const diff = Math.floor((now - d) / 86400000);
        return weekday === i && diff < 7 && s.completed;
      });
      return `<div class="week-day ${isToday ? "today" : ""} ${hasSession ? "done" : ""}">
        <span class="week-dot"></span>
        <span class="week-label">${label}</span>
      </div>`;
    }).join("")}
  </div>`;
}

// ─── Выбор тренировки ─────────────────────────────────────────────────────────
function renderSelect() {
  app.innerHTML = `
    <section class="screen">
      <div class="topbar">
        <div><p class="eyebrow">Выбор дня</p><h1>Тренировка</h1></div>
        <button class="ghost-btn" onclick="navigate('home')">Назад</button>
      </div>

      ${["A", "B", "C"].map(renderDayCard).join("")}

      <article class="card">
        <p class="label">Самочувствие</p>
        <div class="chip-row">
          ${["отлично", "нормально", "устал"].map((v) =>
            `<button class="chip ${state.wellbeing === v ? "active" : ""}"
              data-action="set-wellbeing" data-value="${v}">${v}</button>`
          ).join("")}
        </div>
      </article>

      <button class="primary-btn" data-action="start-session">Старт</button>
    </section>`;
}

function renderDayCard(day) {
  const isSelected = state.selectedDay === day;
  const exercises  = getDayExercises(day);
  const blocked    = exercises.filter((e) => e.blocked);
  const available  = exercises.filter((e) => !e.blocked);

  const dayDescriptions = {
    A: "Жимы, изоляция груди, бицепс",
    B: "Тяги, блоки, трицепс, плечо",
    C: "Ноги · тяжёлый жим · махи" + (state.legsUnlocked ? "" : " · ноги заблокированы"),
  };

  return `
    <button class="card day-card ${isSelected ? "day-card--selected" : ""}"
      data-action="choose-day" data-day="${day}">
      <div class="metric-row">
        <div>
          <h2>${DAY_NAMES[day]}</h2>
          <p class="muted">${dayDescriptions[day]}</p>
        </div>
        <span class="day-letter ${isSelected ? "day-letter--active" : ""}">${day}</span>
      </div>
      <div class="day-stats">
        <span class="badge badge--green">${available.length} упр. доступно</span>
        ${blocked.length ? `<span class="badge badge--warn">${blocked.length} заблокировано</span>` : ""}
      </div>
    </button>`;
}

// ─── Экран тренировки ─────────────────────────────────────────────────────────
async function renderWorkout() {
  if (!state.activeSession) return renderSelect();
  const planner = await ensurePlannerForSession(state.activeSession);
  applyPlannerToTemplates(planner);
  const sets = await store.getSessionSets(state.activeSession.id);
  const exercises = getDayExercises(state.activeSession.dayType);

  const available = exercises.filter((e) => !e.blocked);
  const blocked   = exercises.filter((e) => e.blocked);
  const done      = available.filter((e) => sets.filter((s) => s.exerciseId === e.id).length >= getPlannedSets(e));
  const progress  = available.length ? Math.round((done.length / available.length) * 100) : 0;

  app.innerHTML = `
    <section class="screen">
      <div class="topbar">
        <div>
          <p class="eyebrow">${DAY_NAMES[state.activeSession.dayType]}</p>
          <h1>Тренировка</h1>
        </div>
        <button class="ghost-btn" onclick="navigate('home')">Свернуть</button>
      </div>

      <div class="workout-progress">
        <div class="workout-progress__track">
          <div class="workout-progress__bar" style="width:${progress}%"></div>
        </div>
        <span class="workout-progress__label">${done.length} / ${available.length} упр.</span>
      </div>

      ${available.map((e) => renderExerciseRow(e, sets)).join("")}

      ${blocked.length ? `
      <details class="blocked-section">
        <summary>🔒 Заблокировано (${blocked.length})</summary>
        ${blocked.map((e) => `
          <div class="card blocked-card">
            <div class="metric-row">
              <div><h3>${esc(e.name)}</h3><p class="muted">${esc(e.blockReason)}</p></div>
              <span class="status warn">блок</span>
            </div>
          </div>`).join("")}
      </details>` : ""}

      <button class="primary-btn" data-action="finish-session">Завершить тренировку</button>
    </section>`;
}

function renderExerciseRow(exercise, sets) {
  const count   = sets.filter((s) => s.exerciseId === exercise.id).length;
  const planned = getPlannedSets(exercise);
  const status  = count === 0 ? "не начато" : count < planned ? `${count} / ${planned}` : "выполнено";
  const cls     = count >= planned ? "good" : count ? "work" : "";
  return `
    <button class="card exercise-card" data-action="open-exercise" data-id="${esc(exercise.id)}">
      <div class="exercise-row">
        <div>
          <h3>${esc(exercise.name)}</h3>
          <p class="muted">${esc(exercise.muscleGroup)}</p>
          <p class="plan-inline">${esc(getPlanText(exercise))}</p>
        </div>
        <span class="status ${cls}">${status}</span>
      </div>
    </button>`;
}

function renderProgramPlan(day) {
  const items = getDayExercises(day).filter((exercise) => !exercise.blocked);
  return `
    <article class="card program-plan">
      <p class="label">Программа</p>
      <div class="plan-list">
        ${items.map((exercise) => `
          <div class="plan-line">
            <span>${esc(exercise.name)}</span>
            <strong>${esc(getPlanText(exercise))}</strong>
          </div>`).join("")}
      </div>
    </article>`;
}

// ─── Экран упражнения ─────────────────────────────────────────────────────────
async function renderExercise() {
  if (!state.activeSession || !state.activeExerciseId) return renderWorkout();
  const tmpl = getTemplate(state.activeExerciseId);
  const sets  = (await store.getSessionSets(state.activeSession.id))
    .filter((s) => s.exerciseId === tmpl.id);
  const base  = await store.getWorkingBase(state.activeExerciseId);

  app.innerHTML = `
    <section class="screen">
      <div class="topbar">
        <div><p class="eyebrow">${esc(tmpl.muscleGroup)}</p><h1>${esc(tmpl.name)}</h1></div>
        <button class="ghost-btn" data-action="back-workout">Назад</button>
      </div>

      <article class="card soft orient-card">
        <div class="today-prescription">
          <p class="label">Сегодня</p>
          <h2>${esc(getPlanText(tmpl))}</h2>
          ${renderPlanStepButtons(tmpl)}
        </div>
        <div class="orient-row">
          <div>
            <p class="label">Пик</p>
            <p>${tmpl.peakWeight ? `<strong>${tmpl.peakWeight} кг</strong>` : "—"} <span class="muted">${esc(tmpl.peakScheme)}</span></p>
          </div>
          <div>
            <p class="label">Старт уровня 1</p>
            <p><strong>${tmpl.returnLevel1 ?? "—"} кг</strong></p>
          </div>
        </div>
        ${base ? `
        <div class="base-status">
          <span class="status ${base.status === "confirmed" ? "good" : base.status === "working" ? "work" : "warn"}">
            ${STATUS_LABELS[base.status]}
          </span>
          <span class="muted"> · текущая база: ${base.weight} кг</span>
          ${base.status === "confirmed" ? `<span class="next-step">→ можно +${formatWeightStep(getWeightStep(tmpl))} кг</span>` : ""}
        </div>` : ""}
        <p class="muted technique-note">${esc(tmpl.techniqueNotes)}</p>
      </article>

      ${tmpl.cautionNote ? `<div class="warn">${esc(tmpl.cautionNote)}</div>` : ""}

      ${renderMuscleGuide(tmpl)}

      <article class="card">
        <h2>Подходы${sets.length ? ` · ${sets.length}` : ""}</h2>
        ${sets.length
          ? sets.map(renderSetRow).join("")
          : `<p class="empty">Сохранённых подходов пока нет</p>`}
      </article>

      <article class="card input-card">
        <h2>Факт подхода</h2>
        <p class="muted">Вес и повторы подставлены автоматически. Меняй их, если в зале пришлось адаптироваться.</p>
        <div class="input-row">
          <div class="input-col">
            <p class="label">Вес, кг</p>
            ${renderCounter("weight", state.weight)}
          </div>
          <div class="input-col">
            <p class="label">Повторы</p>
            ${renderCounter("reps", state.reps)}
          </div>
        </div>

        <p class="label">Техника</p>
        <div class="chip-row">
          <button class="chip ${state.technique === "clean" ? "active" : ""}"
            data-action="set-technique" data-value="clean">✓ чисто</button>
          <button class="chip ${state.technique === "cheating" ? "active chip--warn" : ""}"
            data-action="set-technique" data-value="cheating">читинг</button>
        </div>

        <p class="label">Боль / дискомфорт</p>
        <div class="chip-row">
          <button class="chip ${!state.pain ? "active" : ""}"
            data-action="set-pain" data-value="false">нет</button>
          <button class="chip ${state.pain ? "active chip--danger" : ""}"
            data-action="set-pain" data-value="true">есть ⚠</button>
        </div>

        ${state.pain ? `<div class="danger-note">Сохраняется, но рабочая база не обновится. Снизь вес или останови упражнение.</div>` : ""}

        <button class="${state.pain ? "danger-btn" : "primary-btn"}" data-action="save-set">
          ${state.pain ? "⚠ Сохранить (боль)" : "Сохранить подход"}
        </button>
      </article>
    </section>`;
}

function renderMuscleGuide(tmpl) {
  const guide = window.exerciseGuide?.get(tmpl.id);
  if (!guide) return "";
  return `
    <details class="card muscle-guide">
      <summary>
        <h2>Мышцы и техника</h2>
        <span class="muted">показать ▾</span>
      </summary>
      ${window.exerciseGuide.renderBody(guide.primary, guide.secondary)}
      <div class="muscle-legend">
        <span><i class="dot dot--primary"></i> основные</span>
        <span><i class="dot dot--secondary"></i> вспомогательные</span>
      </div>
      <ol class="technique-steps">
        ${guide.steps.map((step) => `<li>${esc(step)}</li>`).join("")}
      </ol>
    </details>`;
}

function renderCounter(key, value) {
  return `
    <div class="counter" data-counter="${key}">
      <button class="counter-btn" data-step="-1">−</button>
      <strong class="counter-value">${value}</strong>
      <button class="counter-btn" data-step="1">+</button>
    </div>`;
}

function renderPlanStepButtons(tmpl) {
  const weights = tmpl.planWeights || [];
  const reps = tmpl.planReps || [];
  if (!weights.length) return "";
  return `
    <div class="plan-step-row">
      ${weights.map((weight, index) => `
        <button
          class="plan-step ${state.weight === Number(weight) && state.reps === Number(reps[index] || reps[0] || 8) ? "active" : ""}"
          data-action="use-plan-step"
          data-weight="${Number(weight)}"
          data-reps="${Number(reps[index] || reps[0] || 8)}"
        >
          ${Number(weight) ? `${weight} кг` : "без веса"} · ${Number(reps[index] || reps[0] || 8)} повт.
        </button>`).join("")}
    </div>`;
}

function renderSetRow(set) {
  return `
    <div class="set-row">
      <div>
        <strong>#${set.setNumber} · ${set.weight} кг × ${set.reps}</strong>
        <p class="muted">${set.technique === "clean" ? "✓ чисто" : "читинг"} · боль: ${set.pain ? "⚠ есть" : "нет"}</p>
      </div>
      <span class="status ${set.pain ? "warn" : "good"}">${set.pain ? "стоп" : "ок"}</span>
    </div>`;
}

// ─── История ──────────────────────────────────────────────────────────────────
async function renderHistory() {
  const sessions = await store.getAllSessions();
  const sets     = await store.getAllSets();
  app.innerHTML = `
    <section class="screen">
      <div><p class="eyebrow">Журнал</p><h1>История</h1></div>
      ${sessions.length
        ? sessions.map((s) => renderHistoryCard(s, sets)).join("")
        : `<p class="empty">История пуста — начни первую тренировку!</p>`}
    </section>`;
  attachSwipeDeletes();
}

function renderHistoryCard(session, sets) {
  const sessionSets = sets.filter((s) => s.sessionId === session.id);
  const names = [...new Set(
    sessionSets.map((s) => getTemplate(s.exerciseId)?.name).filter(Boolean)
  )];
  return `
    <div class="swipe-row" data-swipe-id="${session.id}">
      <button class="delete-swipe-btn" data-action="delete-session" data-id="${session.id}">Удалить</button>
      <button class="card history-card swipe-content" data-action="open-session" data-id="${session.id}">
        <div class="metric-row">
          <div>
            <h2>${formatDate(session.date)}</h2>
            <p class="muted">${DAY_NAMES_SHORT[session.dayType]} · ${esc(session.wellbeing)}</p>
          </div>
          <span class="status ${session.completed ? "good" : "warn"}">${session.completed ? "готово" : "черновик"}</span>
        </div>
        <p class="muted">${sessionSets.length} ${plural(sessionSets.length, "подход", "подхода", "подходов")}${names.length ? " · " + names.slice(0, 3).map(esc).join(", ") : ""}</p>
      </button>
    </div>`;
}

function attachSwipeDeletes() {
  app.querySelectorAll(".swipe-row").forEach((row) => {
    const content = row.querySelector(".swipe-content");
    let startX = 0;
    let currentX = 0;
    let dragging = false;
    let swiped = false;

    const pointX = (event) => event.touches?.[0]?.clientX ?? event.clientX;
    const closeOtherRows = () => {
      app.querySelectorAll(".swipe-row.open").forEach((item) => {
        if (item !== row) {
          item.classList.remove("open");
          item.querySelector(".swipe-content").style.transform = "";
        }
      });
    };

    const start = (event) => {
      startX = pointX(event);
      currentX = startX;
      dragging = true;
      swiped = false;
      content.classList.add("dragging");
      closeOtherRows();
    };

    const move = (event) => {
      if (!dragging) return;
      currentX = pointX(event);
      const delta = Math.min(0, currentX - startX);
      if (Math.abs(delta) > 8) swiped = true;
      content.style.transform = `translateX(${Math.max(delta, -96)}px)`;
    };

    const end = () => {
      if (!dragging) return;
      dragging = false;
      content.classList.remove("dragging");
      const delta = currentX - startX;
      if (delta < -56) {
        row.classList.add("open");
        content.style.transform = "translateX(-96px)";
      } else {
        row.classList.remove("open");
        content.style.transform = "";
      }
    };

    content.addEventListener("touchstart", start, { passive: true });
    content.addEventListener("touchmove", move, { passive: true });
    content.addEventListener("touchend", end);
    content.addEventListener("pointerdown", start);
    content.addEventListener("pointermove", move);
    content.addEventListener("pointerup", end);
    content.addEventListener("pointerleave", end);
    content.addEventListener("click", (event) => {
      if (swiped) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  });
}

async function renderSessionDetails(sessionId) {
  try {
    await renderSessionDetailsUnsafe(sessionId);
  } catch (err) {
    renderError(err);
  }
}

async function renderSessionDetailsUnsafe(sessionId) {
  const session = await store.getSession(sessionId);
  if (!session) {
    navigate("history");
    return;
  }
  const sets    = await store.getSessionSets(sessionId);
  app.innerHTML = `
    <section class="screen">
      <div class="topbar">
        <div><p class="eyebrow">Детали</p><h1>${formatDate(session.date)}</h1></div>
        <button class="ghost-btn" data-action="back-history">Назад</button>
      </div>
      <article class="card soft">
        <p>${esc(DAY_NAMES[session.dayType])}</p>
        <p class="muted">Самочувствие: ${esc(session.wellbeing)}</p>
      </article>
      ${sets.length
        ? renderSetsGroupedByExercise(sets)
        : `<p class="empty">Подходов нет</p>`}
      <button class="primary-btn" data-action="share-session-report" data-id="${session.id}">
        Поделиться отчётом
      </button>
    </section>`;
}

function renderSetsGroupedByExercise(sets) {
  const byExercise = new Map();
  sets.forEach((set) => {
    const items = byExercise.get(set.exerciseId) || [];
    items.push(set);
    byExercise.set(set.exerciseId, items);
  });
  return [...byExercise.entries()].map(([exerciseId, items]) => `
    <article class="card">
      <h3>${esc(getTemplate(exerciseId)?.name || exerciseId)}</h3>
      ${items.map(renderSetRow).join("")}
    </article>`).join("");
}

// ─── Текстовый отчёт о тренировке (для share sheet / Telegram / Заметок) ─────
function buildSessionReportText(session, sets) {
  const lines = [];
  lines.push(`Тренировка · ${formatDate(session.date)}`);
  lines.push(DAY_NAMES[session.dayType] || session.dayType);
  lines.push(`Самочувствие: ${session.wellbeing}`);
  lines.push("");

  const byExercise = new Map();
  sets.forEach((set) => {
    const items = byExercise.get(set.exerciseId) || [];
    items.push(set);
    byExercise.set(set.exerciseId, items);
  });

  if (!byExercise.size) {
    lines.push("Подходов нет.");
  }
  byExercise.forEach((items, exerciseId) => {
    lines.push(getTemplate(exerciseId)?.name || exerciseId);
    items.forEach((set) => {
      const marks = [
        set.technique === "cheating" ? "читинг" : "",
        set.pain ? "⚠ боль" : "",
      ].filter(Boolean).join(", ");
      lines.push(`  ${set.setNumber}) ${set.weight} кг × ${set.reps}${marks ? ` (${marks})` : ""}`);
    });
    lines.push("");
  });

  lines.push(`Всего подходов: ${sets.length}`);
  return lines.join("\n");
}

async function shareSessionReport(sessionId) {
  const session = await store.getSession(sessionId);
  if (!session) {
    window.exportUtils.showToast("Не удалось прочитать тренировку — попробуй ещё раз");
    return;
  }
  const sets = await store.getSessionSets(sessionId);
  const text = buildSessionReportText(session, sets);
  await window.exportUtils.shareText(`Тренировка ${formatDate(session.date)}`, text);
}

// ─── Резервная копия: экспорт и импорт ───────────────────────────────────────
async function exportBackup() {
  const payload = await store.exportAllData();
  const date = new Date().toISOString().slice(0, 10);
  await window.exportUtils.shareOrDownloadFile(
    `strength-backup-${date}.json`,
    "application/json",
    JSON.stringify(payload, null, 2),
  );
}

function pickImportFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const check = store.validateBackup(payload);
      if (!check.ok) {
        window.exportUtils.showToast(check.error);
        return;
      }
      state.pendingImport = { payload, counts: check.counts };
      render();
    } catch (error) {
      console.error(error);
      window.exportUtils.showToast("Не удалось прочитать файл — это не JSON-копия.");
    }
  });
  input.click();
}

async function confirmImport() {
  if (!state.pendingImport) return;
  try {
    const counts = await store.importAllData(state.pendingImport.payload);
    state.pendingImport = null;

    // Перечитываем настройки из импортированной копии в состояние
    state.legsUnlocked = store.getSetting("legsUnlocked") ?? false;
    const profile = store.getSetting("profile") || {};
    if (!["male", "female"].includes(profile.sex)) profile.sex = "male";
    state.profile = { age: "", sex: "male", completed: false, ...profile };
    templates
      .filter((t) => t.muscleGroup === "Ноги")
      .forEach((t) => { t.blocked = !state.legsUnlocked; });

    window.exportUtils.showToast(`Импортировано: ${counts.sessions} тренировок, ${counts.setLogs} подходов`);
    navigate("home");
  } catch (error) {
    console.error(error);
    state.pendingImport = null;
    window.exportUtils.showToast(`Импорт не удался: ${error.message}`);
    render();
  }
}

function renderImportConfirm() {
  const { counts } = state.pendingImport;
  return `
    <div class="modal-backdrop">
      <article class="card profile-modal">
        <div>
          <p class="eyebrow warn-text">Импорт копии</p>
          <h1>Заменить все данные?</h1>
        </div>
        <p class="muted">
          Текущие данные будут полностью заменены содержимым файла:
          ${counts.sessions} тренировок, ${counts.setLogs} подходов,
          ${counts.bodyMeasurements} замеров. Отменить это будет нельзя.
        </p>
        <button class="danger-btn" data-action="confirm-import">Заменить всё</button>
        <button class="secondary-btn" data-action="cancel-import">Отмена</button>
      </article>
    </div>`;
}

// ─── План ────────────────────────────────────────────────────────────────────
async function renderPlan() {
  const planner = await getPlanner();
  const profileNote = getProfileModifier(state.profile).recovery;
  const items = buildUpcomingPlan(planner, 4);
  app.innerHTML = `
    <section class="screen">
      <div>
        <p class="eyebrow">4 недели</p>
        <h1>План</h1>
      </div>
      <article class="card soft">
        <div class="metric-row">
          <div>
            <p class="label">Периодизация</p>
            <h2>Цикл ${planner.cycle || 1} · ${PLANNER_WAVES[planner.waveIndex || 0].label}</h2>
          </div>
          <span class="status work">${(planner.index || 0) + 1} / ${TRAINING_DAYS_TOTAL}</span>
        </div>
        <p class="muted">${esc(profileNote)}. Корректировка идёт по боли, читингу и фактическому выполнению.</p>
      </article>
      ${items.map((item, index) => renderPlanDay(item, index)).join("")}
    </section>`;
}

function buildUpcomingPlan(planner, weeks) {
  const count = weeks * TRAINING_DAYS_PER_WEEK;
  return Array.from({ length: count }, (_, offset) => {
    const index = Math.min(TRAINING_DAYS_TOTAL - 1, (planner.index || 0) + offset);
    const day = ["A", "B", "C"][index % 3];
    const waveIndex = Math.floor(index / 3) % PLANNER_WAVES.length;
    const cycle = Math.floor(index / (PLANNER_WAVES.length * 3)) + 1;
    const wave = PLANNER_WAVES[waveIndex];
    const exercises = getDayExercises(day)
      .filter((tmpl) => !tmpl.blocked)
      .map((tmpl) => ({ tmpl, plan: buildExercisePlan(tmpl, wave, cycle, state.profile) }));
    return {
      index,
      day,
      date: getUpcomingTrainingDate(offset),
      wave,
      cycle,
      exercises,
    };
  });
}

function renderPlanDay(item, position) {
  // Ближайшая тренировка развёрнута, остальные — аккордеоном
  return `
    <details class="card plan-day-card" ${position === 0 ? "open" : ""}>
      <summary>
        <div class="metric-row">
          <div>
            <p class="label">${formatPlanDate(item.date)}</p>
            <h2>${DAY_NAMES[item.day]}</h2>
          </div>
          <span class="status ${position === 0 ? "good" : "work"}">${item.wave.label}</span>
        </div>
      </summary>
      <div class="plan-list">
        ${item.exercises.map(({ tmpl, plan }) => `
          <div class="plan-line">
            <span>${esc(tmpl.name)}</span>
            <strong>${esc(plan.text)}</strong>
          </div>`).join("")}
      </div>
    </details>`;
}

function getUpcomingTrainingDate(offset) {
  const trainingWeekdays = [2, 4, 6]; // Tue, Thu, Sat
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  let found = -1;
  for (let i = 0; i < 60; i += 1) {
    const candidate = new Date(date);
    candidate.setDate(date.getDate() + i);
    if (trainingWeekdays.includes(candidate.getDay())) {
      found += 1;
      if (found === offset) return candidate;
    }
  }
  return date;
}

function formatPlanDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
}

// ─── Прогресс ─────────────────────────────────────────────────────────────────
async function renderProgress() {
  const bases = await store.getWorkingBases();
  const measurements = await store.getBodyMeasurements();
  const days  = ["A", "B", "C"];
  app.innerHTML = `
    <section class="screen">
      <div><p class="eyebrow">Возврат</p><h1>Прогресс</h1></div>
      ${renderMeasurementPanel(measurements)}
      ${days.map((day) => {
        const dayTemplates = templates.filter((t) => t.day === day);
        return `
          <div class="progress-group">
            <p class="progress-group__label">${DAY_NAMES[day]}</p>
            ${dayTemplates.map((t) =>
              renderProgressCard(t, bases.find((b) => b.exerciseId === t.id))
            ).join("")}
          </div>`;
      }).join("")}
    </section>`;
}

function renderMeasurementPanel(measurements) {
  const latest = measurements[0];
  const previous = measurements[1];
  return `
    <article class="card measurement-card">
      <div class="metric-row">
        <div>
          <p class="label">Замеры тела</p>
          <h2>${latest ? formatDate(latest.date) : "Нужна первая точка"}</h2>
        </div>
        <span class="status ${latest ? "good" : "warn"}">${measurements.length}</span>
      </div>
      ${latest ? renderMeasurementSummary(latest, previous) : `<p class="muted">Добавь рост, вес, руки, грудь и талию. Потом приложение будет показывать динамику.</p>`}
      <details class="measure-form">
        <summary class="secondary-btn">+ Новый замер</summary>
        <div class="profile-grid">
          <label class="measure-input">
            <span class="label">Возраст</span>
            <input
              type="number"
              inputmode="numeric"
              min="10"
              max="99"
              data-profile-input="age"
              value="${esc(state.profile.age)}"
              placeholder="лет"
            />
          </label>
          <div class="measure-input">
            <span class="label">Пол</span>
            <div class="chip-row">
              <button class="chip ${state.profile.sex === "male" ? "active" : ""}" data-action="set-sex" data-value="male">муж</button>
              <button class="chip ${state.profile.sex === "female" ? "active" : ""}" data-action="set-sex" data-value="female">жен</button>
            </div>
          </div>
        </div>
        <p class="muted">${esc(getProfileModifier(state.profile).recovery)}</p>
        <div class="measure-grid">
          ${renderMeasureInput("height", "Рост", "см")}
          ${renderMeasureInput("bodyWeight", "Вес", "кг")}
          ${renderMeasureInput("arm", "Руки-базуки", "см")}
          ${renderMeasureInput("chest", "Грудь", "см")}
          ${renderMeasureInput("waist", "Талия", "см")}
        </div>
        <label class="measure-note">
          <span class="label">Заметка</span>
          <input data-measure-input="notes" value="${esc(state.measure.notes)}" placeholder="самочувствие, питание, фото..." />
        </label>
        <button class="primary-btn" data-action="save-measure">Сохранить замер</button>
      </details>
    </article>
    ${measurements.length ? `
    <article class="card soft">
      <p class="label">История замеров</p>
      ${measurements.slice(0, 8).map((item) => `
        <div class="measure-history-row">
          <div>
            <strong>${formatDate(item.date)}</strong>
            <p class="muted">${renderMeasurementLine(item)}</p>
          </div>
          <button class="mini-danger" data-action="delete-measure" data-id="${item.id}">Удалить</button>
        </div>`).join("")}
    </article>` : ""}`;
}

function renderMeasureInput(key, label, unit) {
  return `
    <label class="measure-input">
      <span class="label">${label}</span>
      <input
        type="number"
        step="0.1"
        inputmode="decimal"
        data-measure-input="${key}"
        value="${esc(state.measure[key])}"
        placeholder="${unit}"
      />
    </label>`;
}

function renderMeasurementSummary(latest, previous) {
  const fields = [
    ["bodyWeight", "Вес", "кг"],
    ["arm", "Руки", "см"],
    ["chest", "Грудь", "см"],
    ["waist", "Талия", "см"],
  ];
  return `
    <div class="measurement-summary">
      ${fields.map(([key, label, unit]) => `
        <div>
          <span class="label">${label}</span>
          <strong>${formatMeasure(latest[key], unit)}</strong>
          <small>${formatDelta(latest[key], previous?.[key], unit)}</small>
        </div>`).join("")}
    </div>`;
}

function renderMeasurementLine(item) {
  return [
    item.bodyWeight ? `${item.bodyWeight} кг` : "",
    item.arm ? `руки ${item.arm}` : "",
    item.chest ? `грудь ${item.chest}` : "",
    item.waist ? `талия ${item.waist}` : "",
  ].filter(Boolean).join(" · ");
}

function renderProgressCard(tmpl, base) {
  const percent = tmpl.peakWeight && base?.weight
    ? Math.round((base.weight / tmpl.peakWeight) * 100)
    : null;
  const status  = tmpl.blocked ? "заблокировано" : STATUS_LABELS[base?.status || "none"];
  const cls     = tmpl.blocked ? "warn" : base?.status === "confirmed" ? "good" : base?.status === "working" ? "work" : "";

  return `
    <article class="card progress-card ${tmpl.blocked ? "blocked" : ""}">
      <div class="metric-row">
        <div>
          <h3>${esc(tmpl.name)}</h3>
          <p class="muted">${base?.weight ? `${base.weight} кг` : "нет данных"} · пик: ${tmpl.peakWeight ? `${tmpl.peakWeight} кг` : "—"}</p>
        </div>
        <span class="status ${cls}">${status}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${Math.min(percent || 0, 100)}%"></div>
      </div>
      <p class="muted">${percent === null ? "нет данных для расчёта" : `${percent}% возврата`}</p>
    </article>`;
}

// ─── Отчёт ────────────────────────────────────────────────────────────────────
async function renderReport() {
  const since    = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sessions = (await store.getAllSessions()).filter((s) => new Date(s.date).getTime() >= since);
  const sets     = (await store.getAllSets()).filter((s) => new Date(s.timestamp).getTime() >= since);
  const bases    = await store.getWorkingBases();

  const painEx    = uniqueExerciseNames(sets.filter((s) => s.pain));
  const cheatEx   = uniqueExerciseNames(sets.filter((s) => s.technique === "cheating"));
  const growing   = bases.filter((b) => new Date(b.lastUpdated).getTime() >= since);

  app.innerHTML = `
    <section class="screen">
      <div><p class="eyebrow">7 дней</p><h1>Отчёт</h1></div>
      <article class="card">
        <div class="metric-row"><h2>Тренировок</h2><strong>${sessions.length}</strong></div>
        <div class="metric-row"><h2>Подходов</h2><strong>${sets.length}</strong></div>
      </article>
      ${renderReportList("📈 Рост рабочей базы", growing.map((b) => getTemplate(b.exerciseId)?.name).filter(Boolean))}
      ${renderReportList("⚠ Боль", painEx)}
      ${renderReportList("⚡ Читинг", cheatEx)}
      <article class="card">
        <h2>Рекомендации</h2>
        ${renderRecommendations(bases, sets)}
      </article>
    </section>`;
}

function renderRecommendations(bases, sets) {
  // Только упражнения, по которым есть данные (подходы за неделю или база) —
  // без заблокированных и не начатых, чтобы не было простыни «начать с уровня 1»
  const relevant = templates.filter((t) => {
    if (t.blocked) return false;
    return sets.some((s) => s.exerciseId === t.id) || bases.some((b) => b.exerciseId === t.id);
  });
  if (!relevant.length) {
    return `<p class="muted">Пока нет данных — заверши первую тренировку, и здесь появятся советы по каждому упражнению.</p>`;
  }
  return relevant.map((t) => `
    <div class="rec-row">
      <span class="muted">${esc(t.name)}</span>
      <span>${esc(getRecommendation(t, bases.find((b) => b.exerciseId === t.id), sets))}</span>
    </div>`).join("");
}

function renderReportList(title, items) {
  return `
    <article class="card soft">
      <h2>${title}</h2>
      ${items.length
        ? items.map((item) => `<p>${esc(item)}</p>`).join("")
        : `<p class="muted">Нет</p>`}
    </article>`;
}

function getRecommendation(tmpl, base, sets) {
  const related = sets.filter((s) => s.exerciseId === tmpl.id);
  if (tmpl.blocked)                               return "заблокировано";
  if (related.some((s) => s.pain))                return "не повышать, снизить или заменить";
  if (related.some((s) => s.technique === "cheating")) return "закрепить технику";
  if (base?.status === "confirmed")               return `можно +${formatWeightStep(getWeightStep(tmpl))} кг`;
  if (base?.status === "working")                 return "закрепить этот вес";
  if (base?.status === "probe")                   return "повторить чисто";
  return "начать с уровня 1";
}

// ─── Настройки (свитчер ног) ──────────────────────────────────────────────────
function renderSettings() {
  app.innerHTML = `
    <section class="screen">
      <div class="topbar">
        <div><p class="eyebrow">Управление</p><h1>Настройки</h1></div>
        <button class="ghost-btn" data-action="go-home">Назад</button>
      </div>

      <article class="card">
        <div class="setting-row">
          <div>
            <h3>Упражнения на ноги</h3>
            <p class="muted">Жим платформы, разгибания квадрицепса.<br>Разблокировать только после разрешения врача.</p>
          </div>
          <button
            class="toggle-btn ${state.legsUnlocked ? "toggle-btn--on" : ""}"
            data-action="toggle-legs"
            aria-label="Включить ноги"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>
        ${state.legsUnlocked
          ? `<div class="warn">Ноги включены. Начинай осторожно, следи за коленом.</div>`
          : `<div class="card soft"><p class="muted">Ноги заблокированы — защита мениска. День C доступен без упражнений на ноги.</p></div>`
        }
      </article>

      <article class="card soft">
        <h3>Расписание</h3>
        <div class="schedule-grid">
          <div class="schedule-cell">
            <span class="schedule-day">Пн</span>
            <span class="badge badge--green">А</span>
          </div>
          <div class="schedule-cell">
            <span class="schedule-day">Ср</span>
            <span class="badge badge--blue">Б</span>
          </div>
          <div class="schedule-cell">
            <span class="schedule-day">Пт</span>
            <span class="badge ${state.legsUnlocked ? "badge--warn" : "badge--purple"}">В</span>
          </div>
        </div>
        <p class="muted">А → Б → В чередование. День В: ноги + тяжёлый жим + махи${state.legsUnlocked ? "" : " (ноги заблокированы)"}.</p>
      </article>

      <article class="card">
        <h3>Данные</h3>
        <p class="muted">
          Все данные хранятся только на этом устройстве. Удаление иконки приложения
          с экрана «Домой» стирает всю историю — делай резервные копии регулярно.
        </p>
        <div class="grid-2">
          <button class="secondary-btn" data-action="export-backup">Экспорт копии</button>
          <button class="secondary-btn" data-action="import-backup">Импорт из файла</button>
        </div>
      </article>
      ${state.pendingImport ? renderImportConfirm() : ""}
    </section>`;
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────
function getTemplate(id) {
  return templates.find((t) => t.id === id);
}

function getDayExercises(day) {
  return templates.filter((t) => t.day === day);
}

function getNextDay(lastSession) {
  if (!lastSession) return "A";
  const map = { A: "B", B: "C", C: "A" };
  return map[lastSession.dayType] || "A";
}

function getPlanText(tmpl) {
  return tmpl.currentPlan || tmpl.peakScheme || "по самочувствию";
}

function getPlannedWeight(tmpl) {
  const first = tmpl.planWeights?.[0];
  if (first !== undefined) return Number(first);
  return Number(tmpl.returnLevel1 || 0);
}

function getPlannedReps(tmpl) {
  const first = tmpl.planReps?.[0];
  return Number(first || 8);
}

function getActiveWeightStep() {
  const tmpl = getTemplate(state.activeExerciseId);
  return getWeightStep(tmpl);
}

function getActiveMinWeight() {
  const tmpl = getTemplate(state.activeExerciseId);
  return getMinWeight(tmpl);
}

function getWeightStep(tmpl) {
  if (!tmpl) return 2.5;
  if (Number(tmpl.weightStep)) return Number(tmpl.weightStep);
  if (String(tmpl.id || "").includes("dumbbell")) return 1;
  return 2.5;
}

function getMinWeight(tmpl) {
  if (!tmpl) return 0;
  if (tmpl.minWeight !== undefined) return Number(tmpl.minWeight);
  if (String(tmpl.id || "").includes("dumbbell")) return 1;
  return 0;
}

function formatWeightStep(step) {
  return Number.isInteger(step) ? String(step) : String(step).replace(".", ",");
}

function uniqueExerciseNames(sets) {
  return [...new Set(sets.map((s) => getTemplate(s.exerciseId)?.name).filter(Boolean))];
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

function roundToWeightStep(value, step = 2.5) {
  const normalizedStep = Number(step) || 2.5;
  return roundToHalf(Math.round(value / normalizedStep) * normalizedStep);
}

// ─── Применить текущее состояние legsUnlocked к шаблонам ─────────────────────
templates
  .filter((t) => t.muscleGroup === "Ноги")
  .forEach((t) => { t.blocked = !state.legsUnlocked; });

state.route = location.hash.replace("#", "") || "home";
render();
