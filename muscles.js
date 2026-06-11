// Схема мышц и пошаговая техника для экрана упражнения.
// Всё инлайново (SVG-строки), работает офлайн, без внешних ресурсов.

(function () {
  // Ключи мышц в GUIDE: chest, front-delts, side-delts, rear-delts, traps, lats,
  // lower-back, biceps, triceps, forearms, abs, quads, hamstrings, glutes, calves.
  // Маппинг на анатомические slug'и из body-paths.js (react-native-body-highlighter):
  const KEY_TO_SLUG = {
    chest: ["chest"],
    "front-delts": ["deltoids"],
    "side-delts": ["deltoids"],
    "rear-delts": ["deltoids"],
    traps: ["trapezius"],
    lats: ["upper-back"],
    "lower-back": ["lower-back"],
    biceps: ["biceps"],
    triceps: ["triceps"],
    forearms: ["forearm"],
    abs: ["abs"],
    quads: ["quadriceps"],
    hamstrings: ["hamstring"],
    glutes: ["gluteal"],
    calves: ["calves"],
  };

  function slugsFor(keys) {
    const set = new Set();
    keys.forEach((k) => (KEY_TO_SLUG[k] || []).forEach((s) => set.add(s)));
    return set;
  }

  function renderSide(side, label, primarySlugs, secondarySlugs) {
    const data = window.bodyPaths?.[side];
    if (!data) return "";
    const muscleLayers = Object.entries(data.parts).map(([slug, paths]) => {
      const cls = primarySlugs.has(slug) ? "primary" : secondarySlugs.has(slug) ? "secondary" : "";
      return paths.map((d) => `<path d="${d}" class="m ${cls}"/>`).join("");
    }).join("");
    return `
      <figure class="muscle-fig">
        <svg viewBox="${data.viewBox}" role="img" aria-label="Мышцы ${label}">
          <path d="${data.outline}" class="body-outline"/>
          ${muscleLayers}
        </svg>
        <figcaption>${label}</figcaption>
      </figure>`;
  }

  function renderBody(primary = [], secondary = []) {
    const primarySlugs = slugsFor(primary);
    const secondarySlugs = slugsFor(secondary);
    return `
      <div class="muscle-svg">
        ${renderSide("front", "спереди", primarySlugs, secondarySlugs)}
        ${renderSide("back", "сзади", primarySlugs, secondarySlugs)}
      </div>`;
  }

  // Какие мышцы работают и как делать — по id упражнения
  const GUIDE = {
    "incline-barbell-volume": {
      primary: ["chest"],
      secondary: ["front-delts", "triceps"],
      steps: [
        "Лопатки свести и прижать к скамье, лёгкий прогиб в пояснице.",
        "Опусти штангу к верху груди под контролем, локти ~45° к корпусу.",
        "Коснись груди или чуть выше — без отбива.",
        "Выжми вверх по той же траектории, 1-2 повтора в запасе.",
      ],
    },
    "hammer-down-press": {
      primary: ["chest"],
      secondary: ["triceps"],
      steps: [
        "Сядь плотно, грудь раскрыта, плечи опущены вниз.",
        "Жми рукоятки вниз-вперёд, не выводя плечо в болезненную позицию.",
        "В нижней точке короткая пауза, чувствуй низ груди.",
        "Возвращай медленно, не бросая вес.",
      ],
    },
    "pec-deck": {
      primary: ["chest"],
      secondary: ["front-delts"],
      steps: [
        "Подбери высоту сиденья: предплечья/ладони на уровне середины груди.",
        "Корпус прижат к спинке, плечи вниз.",
        "Своди медленно, без рывка, до лёгкого касания.",
        "Разводи под контролем — не дальше комфортного растяжения.",
      ],
    },
    "scott-curl": {
      primary: ["biceps"],
      secondary: ["forearms"],
      steps: [
        "Плечи и трицепс плотно прижаты к подушке.",
        "Сгибай руки без раскачки корпуса — особенно левую, без читинга.",
        "Вверху короткое пиковое сокращение.",
        "Опускай медленно, не бросай вес вниз.",
      ],
    },
    "biceps-finisher-a": {
      primary: ["biceps"],
      secondary: ["forearms"],
      steps: [
        "Лёгкий вес, идеальная техника.",
        "Полная амплитуда, без боли и рывков.",
        "Цель — добить мышцу, а не поставить рекорд.",
      ],
    },
    "romanian-deadlift": {
      primary: ["hamstrings", "glutes"],
      secondary: ["lower-back", "forearms", "traps"],
      steps: [
        "Штанга близко к ногам, спина нейтральная, лопатки собраны.",
        "Движение через таз назад, колени чуть согнуты и не гуляют.",
        "Опускай до растяжения задней поверхности бедра, не округляя спину.",
        "Вверх — толкая таз вперёд, без переразгибания в пояснице.",
      ],
    },
    "lat-pulldown": {
      primary: ["lats"],
      secondary: ["biceps", "rear-delts"],
      steps: [
        "Хват чуть шире плеч, корпус почти вертикально, взгляд вверх.",
        "Тяни локти вперёд-вниз, а не рукоятку руками.",
        "К верху груди, лопатки вниз; сильно назад не отклоняйся.",
        "Возврат медленный, с растяжением широчайших.",
      ],
    },
    "reverse-grip-pulldown": {
      primary: ["lats"],
      secondary: ["biceps"],
      steps: [
        "Обратный хват на ширине плеч, плечи опущены.",
        "Тяни локти вниз вдоль корпуса.",
        "Не превращай движение в сгибание на бицепс — работает спина.",
        "Плавный возврат до полного выпрямления рук.",
      ],
    },
    "triceps-pushdown": {
      primary: ["triceps"],
      secondary: ["forearms"],
      steps: [
        "Встань ближе к блоку, можно одну ногу вперёд для устойчивости.",
        "Локти прижаты к корпусу и неподвижны.",
        "Разгибай до полного выпрямления, короткая пауза.",
        "Возврат медленный, локти не уходят вперёд.",
      ],
    },
    "face-pull": {
      primary: ["rear-delts", "traps"],
      secondary: ["lats"],
      steps: [
        "Канат на уровне лица, шаг назад, лёгкий наклон.",
        "Тяни к лицу, разводя концы каната, локти высоко.",
        "Своди лопатки, чувствуй заднюю дельту и ротаторы.",
        "Это профилактика плеча: вес умеренный, без читинга.",
      ],
    },
    "leg-press": {
      primary: ["quads", "glutes"],
      secondary: ["hamstrings", "calves"],
      steps: [
        "Стопы на ширине плеч по центру платформы, поясница прижата.",
        "Опускай в короткий безопасный диапазон — колено без боли.",
        "Колени по линии стоп, не своди внутрь.",
        "Выжимай без полного «защёлкивания» коленей наверху.",
      ],
    },
    "quad-extension": {
      primary: ["quads"],
      secondary: [],
      steps: [
        "Настрой валик на нижнюю треть голени, колено по оси тренажёра.",
        "Разгибай плавно, без рывка из нижней точки.",
        "Верх — без боли; задержись на секунду.",
        "Опускай медленно, не бросая вес.",
      ],
    },
    "incline-barbell-heavy": {
      primary: ["chest", "front-delts"],
      secondary: ["triceps"],
      steps: [
        "Лопатки сведены, хват стабильный, ноги в упоре.",
        "Опускай ниже, к верху груди, под полным контролем.",
        "Жми мощно, но без отрыва таза от скамьи.",
        "На тяжёлых подходах — страховка обязательно.",
      ],
    },
    "dumbbell-lateral-raise": {
      primary: ["side-delts"],
      secondary: ["traps"],
      steps: [
        "Лёгкий наклон корпуса вперёд, мягкий локоть.",
        "Поднимай гантели в стороны до уровня плеч, мизинец чуть выше.",
        "Без рывка корпусом — вес поднимают только плечи.",
        "Опускай медленнее, чем поднимал.",
      ],
    },
    "biceps-finisher-c": {
      primary: ["biceps"],
      secondary: ["forearms"],
      steps: [
        "Лёгкий вес, идеальная техника.",
        "Полная амплитуда, без боли и рывков.",
        "Цель — добить мышцу, а не поставить рекорд.",
      ],
    },
  };

  window.exerciseGuide = {
    get(id) {
      return GUIDE[id] || null;
    },
    renderBody,
  };
})();
