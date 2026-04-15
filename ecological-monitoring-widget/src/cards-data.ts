import { MonitoringCard } from './config';

export const DEFAULT_MONITORING_CARDS: MonitoringCard[] = [
  {
    id: 'landfills',
    title: 'Свалки',
    titleRu: 'Свалки',
    titleUz: 'Chiqindihonalar',
    titleUzCyrl: 'Чиқиндиҳоналар',
    description: 'Выявление случаев выхода отходов за пределы установленных площадок хранения и обнаружение новых незаконных зон размещения отходов',
    descriptionRu: 'Выявление случаев выхода отходов за пределы установленных площадок хранения и обнаружение новых незаконных зон размещения отходов',
    descriptionUz: "Mavjud chiqindilarni saqlash joylarida belgilangan hududdan tashqariga chiqish holatlarini aniqlash, yangi paydo bo'lgan noqonuniy chiqindi zonalarini aniqlash",
    descriptionUzCyrl: 'Мавжуд чиқиндиларни сақлаш жойларида белгиланган ҳудуддан ташқарига чиқиш ҳолатларини аниқлаш, янги пайдо бўлган ноқонуний чиқинди зоналарини аниқлаш',
    imageUrl: '/widgets/ecological-monitoring-widget/dist/runtime/assets/chiqindixona.jpg'
  },
  {
    id: 'river-protection-zone',
    title: 'Водоохранные зоны рек',
    titleRu: 'Водоохранные зоны рек',
    titleUz: 'Daryo muhofaza hududi',
    titleUzCyrl: 'Дарё муҳофаза ҳудуди',
    description: 'Выявление отклонений от проекта и незаконной добычи нерудных материалов в руслах рек, прибрежных полосах и водоохранных зонах, в том числе на участках расчистки',
    descriptionRu: 'Выявление отклонений от проекта и незаконной добычи нерудных материалов в руслах рек, прибрежных полосах и водоохранных зонах, в том числе на участках расчистки',
    descriptionUz: "Daryo o'zanlari, sohil bo'yi mintaqalarida va suvni muhofaza qilish zonalarida noruda materiallarni qazish hamda daryo o'zanlarida tozalash ishlari olib borilayotgan uchastkalarda loyihadan chetga chiqish, noqonuniy qazib olish holatlarini aniqlash",
    descriptionUzCyrl: 'Дарё ўзанлари, соҳил бўйи минтақалари ва сувни муҳофаза қилиш зоналарида норуда материалларини қазиш ҳамда дарё ўзанларида тозалаш ишлари олиб борилаётган участкаларда лойиҳадан четга чиқиш, ноқонуний қазиб олиш ҳолатларини аниқлаш',
    imageUrl: '/widgets/ecological-monitoring-widget/dist/runtime/assets/daryo.jpg'
  },
  {
    id: 'field-fires',
    title: 'Полевые пожары',
    titleRu: 'Полевые пожары',
    titleUz: "Dala yong'inlari",
    titleUzCyrl: 'Дала ёнғинлари',
    description: 'Выявление случаев горения соломы и её остатков на полях после уборки зерновых культур',
    descriptionRu: 'Выявление случаев горения соломы и её остатков на полях после уборки зерновых культур',
    descriptionUz: "Boshoqli don ekinlaridan bo'shagan (o'rimdan keyin) yer maydonlarida somon poyalari va ularning qoldiqlari yonish holatlarini aniqlash",
    descriptionUzCyrl: 'Бошоқли дон экинларидан бўшаган (ўримдан кейин) ер майдонларида сомон поялари ва уларнинг қолдиқлари ёниш ҳолатларини аниқлаш',
    imageUrl: '/widgets/ecological-monitoring-widget/dist/runtime/assets/dala.jpg'
  },
  {
    id: 'protected-areas',
    title: 'Охраняемые территории',
    titleRu: 'Охраняемые территории',
    titleUz: 'Muhofaza etiladigan hududlar',
    titleUzCyrl: 'Муҳофаза ҳудудлари',
    description: 'Выявление самовольного захвата земель и незаконного строительства зданий и сооружений в особо охраняемых природных территориях',
    descriptionRu: 'Выявление самовольного захвата земель и незаконного строительства зданий и сооружений в особо охраняемых природных территориях',
    descriptionUz: "Muhofaza etiladigan tabiiy hududlarda yer uchastkalarining o'zboshimchalik bilan egallab olinishi, noqonuniy bino va inshootlar qurilishi holatlarini aniqlash",
    descriptionUzCyrl: 'Муҳофаза этиладиган табиий ҳудудларда ер участкаларининг ўзбошимчалик билан эгаллаб олиниши, ноқонуний бино ва иншоотлар қурилиш ҳолатларини аниқлаш',
    imageUrl: '/widgets/ecological-monitoring-widget/dist/runtime/assets/muhofaza.jpg'
  },
  {
    id: 'forest-cover',
    title: 'Лесной покров',
    titleRu: 'Лесной покров',
    titleUz: "O'rmon qoplamlari",
    titleUzCyrl: 'Ўрмон қоплами',
    description: 'Определение границ лесопокрытых территорий',
    descriptionRu: 'Определение границ лесопокрытых территорий',
    descriptionUz: "O'rmon bilan qoplangan maydonlarning chegaralarini belgilash",
    descriptionUzCyrl: 'Ўрмон билан қопланган майдонларнинг чегараларини белгилаш',
    imageUrl: '/widgets/ecological-monitoring-widget/dist/runtime/assets/ormon.jpg'
  }
];

