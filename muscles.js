// Схема мышц и пошаговая техника для экрана упражнения.
// Всё инлайново (SVG-строки), работает офлайн, без внешних ресурсов.

(function () {
  // Ключи мышц: chest, front-delts, side-delts, rear-delts, traps, lats,
  // lower-back, biceps, triceps, forearms, abs, quads, hamstrings, glutes, calves

  // Контуры тела (нейтральные, не подсвечиваются)
  const BODY = [
    // спереди
    `<circle cx="60" cy="16" r="10"/>`,
    `<rect x="55" y="25" width="10" height="9" rx="3"/>`,
    `<path d="M42 33 L78 33 L74 102 L46 102 Z"/>`,
    `<rect x="46" y="100" width="28" height="10" rx="4"/>`,
    `<ellipse cx="52" cy="172" rx="5" ry="16"/>`,
    `<ellipse cx="68" cy="172" rx="5" ry="16"/>`,
    // сзади
    `<circle cx="160" cy="16" r="10"/>`,
    `<rect x="155" y="25" width="10" height="9" rx="3"/>`,
    `<path d="M142 33 L178 33 L174 102 L146 102 Z"/>`,
  ];

  // Мышечные зоны: [keys, svg-шаблон] — %CLS% заменяется на классы
  const MUSCLES = [
    // ── спереди ──
    [["front-delts", "side-delts"], `<circle cx="38" cy="41" r="8" class="m %CLS%"/>`],
    [["front-delts", "side-delts"], `<circle cx="82" cy="41" r="8" class="m %CLS%"/>`],
    [["chest"], `<ellipse cx="49" cy="58" rx="10.5" ry="8.5" class="m %CLS%"/>`],
    [["chest"], `<ellipse cx="71" cy="58" rx="10.5" ry="8.5" class="m %CLS%"/>`],
    [["biceps"], `<ellipse cx="33" cy="67" rx="5.5" ry="10" class="m %CLS%"/>`],
    [["biceps"], `<ellipse cx="87" cy="67" rx="5.5" ry="10" class="m %CLS%"/>`],
    [["forearms"], `<ellipse cx="29" cy="91" rx="4.5" ry="11" class="m %CLS%"/>`],
    [["forearms"], `<ellipse cx="91" cy="91" rx="4.5" ry="11" class="m %CLS%"/>`],
    [["abs"], `<rect x="51" y="69" width="18" height="27" rx="6" class="m %CLS%"/>`],
    [["quads"], `<ellipse cx="52" cy="130" rx="7.5" ry="22" class="m %CLS%"/>`],
    [["quads"], `<ellipse cx="68" cy="130" rx="7.5" ry="22" class="m %CLS%"/>`],
    // ── сзади ──
    [["traps"], `<path d="M146 34 L174 34 L167 50 L153 50 Z" class="m %CLS%"/>`],
    [["rear-delts"], `<circle cx="138" cy="41" r="8" class="m %CLS%"/>`],
    [["rear-delts"], `<circle cx="182" cy="41" r="8" class="m %CLS%"/>`],
    [["lats"], `<path d="M148 52 C141 62 143 80 153 88 L158 58 Z" class="m %CLS%"/>`],
    [["lats"], `<path d="M172 52 C179 62 177 80 167 88 L162 58 Z" class="m %CLS%"/>`],
    [["lower-back"], `<rect x="153" y="80" width="14" height="16" rx="4" class="m %CLS%"/>`],
    [["triceps"], `<ellipse cx="133" cy="67" rx="5.5" ry="10" class="m %CLS%"/>`],
    [["triceps"], `<ellipse cx="187" cy="67" rx="5.5" ry="10" class="m %CLS%"/>`],
    [["forearms"], `<ellipse cx="129" cy="91" rx="4.5" ry="11" class="m %CLS%"/>`],
    [["forearms"], `<ellipse cx="191" cy="91" rx="4.5" ry="11" class="m %CLS%"/>`],
    [["glutes"], `<ellipse cx="152" cy="108" rx="8" ry="9" class="m %CLS%"/>`],
    [["glutes"], `<ellipse cx="168" cy="108" rx="8" ry="9" class="m %CLS%"/>`],
    [["hamstrings"], `<ellipse cx="152" cy="136" rx="7.5" ry="20" class="m %CLS%"/>`],
    [["hamstrings"], `<ellipse cx="168" cy="136" rx="7.5" ry="20" class="m %CLS%"/>`],
    [["calves"], `<ellipse cx="152" cy="174" rx="5.5" ry="14" class="m %CLS%"/>`],
    [["calves"], `<ellipse cx="168" cy="174" rx="5.5" ry="14" class="m %CLS%"/>`],
  ];

  function renderBody(primary = [], secondary = []) {
    const cls = (keys) => {
      if (keys.some((k) => primary.includes(k))) return "primary";
      if (keys.some((k) => secondary.includes(k))) return "secondary";
      return "";
    };
    return `
      <svg class="muscle-svg" viewBox="0 0 220 196" role="img" aria-label="Схема работающих мышц">
        <g class="b">${BODY.join("")}</g>
        ${MUSCLES.map(([keys, tpl]) => tpl.replace("%CLS%", cls(keys))).join("")}
        <text x="60" y="194" text-anchor="middle" class="t">спереди</text>
        <text x="160" y="194" text-anchor="middle" class="t">сзади</text>
      </svg>`;
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
