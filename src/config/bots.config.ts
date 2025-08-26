export default () => ({
  bots: [
    {
      name: 'SmartVolListener',
      enabled: true,
      based_on_default_logic: true,
      prod: false,
      is_trended: true,
      direction: 'long',
      // Таймфреймы отсортированы по приоритету: часовой > минутный
      timeframe_trend: ['1h', '1m'],
      symbol_filter: [],
      scheduled_notification: true,
      scheduled_time: '1h',
      exchange_profile: 'BITGET',
      telegram_channel: 'bot1',
      smartvol: { baseUsd: 200, addFraction: 0.5, leverage: 15 },
      strategy: null,
      maxFills: 4,
    },
    {
      name: 'SmartVolListenerTrend',
      enabled: true,
      based_on_default_logic: true,
      prod: false,
      is_trended: true,
      direction: 'long',
      // Таймфреймы отсортированы по приоритету: часовой > минутный
      timeframe_trend: ['2h', '3m'],
      symbol_filter: [],
      scheduled_notification: true,
      scheduled_time: '1h',
      exchange_profile: 'BITGET',
      telegram_channel: 'bot2',
      smartvol: { baseUsd: 400, addFraction: 0.3, leverage: 10 },
      strategy: null,
      maxFills: 4,
    },
    {
      name: 'DominationListener',
      enabled: true,
      based_on_default_logic: false, // Использует Domination стратегию
      prod: false,
      is_trended: false, // Domination не зависит от тренда
      direction: 'both', // Может быть и long и short
      timeframe_trend: ['5m'], // Таймфреймы для Domination
      symbol_filter: [], // Все символы
      scheduled_notification: false, // Уведомления только по событиям
      scheduled_time: null,
      exchange_profile: 'BITGET',
      telegram_channel: 'domination', // Новый канал
      smartvol: null, // Не использует SmartVol логику
      strategy: 'domination', // Указываем тип стратегии
      maxFills: 1, // Только одна позиция на символ
    },
    {
      name: 'SmartVolPartialClose',
      enabled: true,
      based_on_default_logic: false, // Использует Partial Close стратегию
      prod: false,
      is_trended: false, // Тренд не проверяется
      direction: 'long',
      // Таймфреймы для сигналов входа/выхода
      timeframe_trend: ['1h', '4h'],
      symbol_filter: [], // Все символы
      scheduled_notification: true,
      scheduled_time: '1h',
      exchange_profile: 'BITGET',
      telegram_channel: 'bot3', // Используем bot3 канал
      smartvol: { baseUsd: 300, addFraction: 0.5, leverage: 12 },
      strategy: 'partial-close', // Указываем тип стратегии
      maxFills: 4, // Максимум 4 докупки
    },
    {
      name: 'SmartVolumeBot',
      enabled: true,
      based_on_default_logic: false, // Использует SmartVolume стратегию
      prod: false,
      is_trended: false, // Тренд не проверяется
      direction: 'long',
      // Таймфреймы для сигналов входа/выхода
      timeframe_trend: ['30m'],
      symbol_filter: [], // Все символы
      scheduled_notification: true,
      scheduled_time: '30m',
      exchange_profile: 'BITGET',
      telegram_channel: 'bot4', // Используем bot4 канал
      smartvol: { baseUsd: 500, addFraction: 0.3, leverage: 15 },
      strategy: 'smartvolume', // Указываем тип стратегии
      maxFills: 3, // Максимум 3 докупки
    },
    {
      name: 'TrendPivot15m',
      enabled: true,
      based_on_default_logic: false, // Использует TrendPivot стратегию
      prod: false,
      is_trended: false, // Тренд не проверяется
      direction: 'long',
      // Таймфреймы для трендовых сигналов
      timeframe_trend: ['15m', '4h'],
      symbol_filter: [], // Все символы
      scheduled_notification: false, // Уведомления только по событиям
      scheduled_time: null,
      exchange_profile: 'BITGET',
      telegram_channel: 'trend-pivot-15m', // Новый канал
      smartvol: { baseUsd: 250, addFraction: 0.4, leverage: 10 },
      strategy: 'trend-pivot', // Указываем тип стратегии
      maxFills: 1, // Только одна позиция на символ
    },
    {
      name: 'TrendPivot1h',
      enabled: true,
      based_on_default_logic: false, // Использует TrendPivot стратегию
      prod: false,
      is_trended: false, // Тренд не проверяется
      direction: 'long',
      // Таймфреймы для трендовых сигналов
      timeframe_trend: ['1h', '4h'],
      symbol_filter: [], // Все символы
      scheduled_notification: false, // Уведомления только по событиям
      scheduled_time: null,
      exchange_profile: 'BITGET',
      telegram_channel: 'trend-pivot-1h', // Новый канал
      smartvol: { baseUsd: 350, addFraction: 0.3, leverage: 12 },
      strategy: 'trend-pivot', // Указываем тип стратегии
      maxFills: 1, // Только одна позиция на символ
    },
  ],
  telegram: {
    bot1: {
      token: '7976932775:AAHF3TMfRbcIN0RyTBeLG5oR3aLjaWuOngo',
      chatId: '-4814413737',
      name: 'SmartVol Bot 1 (Trend Checker)',
    },
    bot2: {
      token: '8422880375:AAGzPLF3CgVOQcOleRTjRthMLt2hbMkDMoE',
      chatId: '-4854279102',
      name: 'SmartVol Bot 2 (Trend Checker)',
    },
    domination: {
      token: '8240226135:AAGWhAF8qTqgcs1BBu_3iDZ6mWEdNenraAY', // Используем тот же токен
      chatId: '-4861757921', // Или укажите другой chatId
      name: 'Domination Bot',
    },
    bot3: {
      token: '8368325139:AAEWsn7DZNFjnRfGquToJhbnoMc3ytTwOBI', // Используем тот же токен
      chatId: '-4971796795', // Или укажите другой chatId
      name: 'SmartVol Partial Close Bot or +25',
    },
    bot4: {
      token: '8380397162:AAEsOpFUAqOdkFlaYh33xOhtuS6_-GqQF8U', // Используем тот же токен
      chatId: '-4866666169', // Или укажите другой chatId
      name: 'SmartVolume Decreaser Bot',
    },
    'trend-pivot-15m': {
      token: '8384811522:AAGuc56xPZKARqnoU0WaBAzm_OzHCwfMicA', // Используем тот же токен
      chatId: '-4734507504', // Или укажите другой chatId
      name: 'Trend Pivot 15m Bot',
    },
    'trend-pivot-1h': {
      token: '8489609392:AAGp1Ic6Ld-EHrW0M5QNvwdzKhNyrQQyXFs', // Используем тот же токен
      chatId: '-4865454085', // Или укажите другой chatId
      name: 'Trend Pivot 1h Bot',
    },
  },
  bitget: {
    BITGET: {
      baseURL: 'https://api.bitget.com',
      key: 'KEY1',
      secret: 'SEC1',
      passphrase: 'PASS1',
      productType: 'umcbl',
      marginCoin: 'USDT',
      allowedCsv: 'ETHUSDT_UMCBL,LINKUSDT_UMCBL,LTCUSDT_UMCBL',
    },
    BITGET2: {
      baseURL: 'https://api.bitget.com',
      key: 'KEY2',
      secret: 'SEC2',
      passphrase: 'PASS2',
      productType: 'umcbl',
      marginCoin: 'USDT',
      allowedCsv: 'ETHUSDT_UMCBL,LINKUSDT_UMCBL,LTCUSDT_UMCBL',
    },
  },
});
