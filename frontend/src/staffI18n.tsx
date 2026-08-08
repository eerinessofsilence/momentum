import { createContext, useContext } from 'react'

export type StaffLocale = 'en' | 'uk' | 'ru'

export function buildStaffEmail(username: string) {
  return `${username.replace(/[^A-Za-z0-9_]/g, '').toLowerCase()}@momentum-wallet.com`
}

const en = {
  clients: 'Clients', analytics: 'Analytics', workspace: 'Workspace', soon: 'Soon', moderator: 'Moderator', signOut: 'Sign out',
  totalClients: 'Total clients', managedPortfolio: 'Managed portfolio', needsReply: 'Needs reply', transactions: 'Transactions',
  new: 'New', searchClients: 'Search clients', loadingClients: 'Loading clients…', noMatchingClients: 'No matching clients',
  searchHint: 'Try another name, username, email, or ID.', selectClient: 'Select a client', selectClientHint: 'Choose an account from the list to open its workspace.',
  noConversation: 'No conversation yet', reply: 'Reply', previousPage: 'Previous client page', nextPage: 'Next client page', of: 'of',
  overview: 'Overview', conversation: 'Conversation', activity: 'Activity', openAsClient: 'Open as client', opening: 'Opening…',
  openNavigation: 'Open navigation', closeNavigation: 'Close navigation', backToClients: 'Back to clients', clientWorkspace: 'Client workspace', activeOnly: 'Only active profiles can be opened',
  confirmationCodes: 'Confirmation codes', unused: 'unused', clearAllCodes: 'Clear all codes', confirmationOff: 'Confirmation is off',
  confirmationOffHint: 'Codes exist but the client is never asked for them. Set a requirement to start.', verificationComplete: 'Verification complete',
  verificationCompleteHint: 'The client has entered every code this transfer needs.', codesRequired: 'Codes required', codesEntered: 'Codes entered',
  notSaved: 'Not saved yet — press Enter or click away to apply.', copied: 'Copied', copy: 'Copy', everyCodeUsed: 'Every code has been used',
  noCodes: 'No codes yet', used: 'Used', copyCode: 'Copy code', showFewer: 'Show fewer', generate: 'Generate', code: 'code', codes: 'codes',
  clientProfile: 'Client profile', clientName: 'Client name', username: 'Username', emailAddress: 'Email address', clientSince: 'Client since',
  clientId: 'Client ID', profileStatus: 'Profile status', active: 'Active', frozen: 'Frozen', deleted: 'Archived', resetPassword: 'Reset temporary password',
  walletsBalances: 'Wallets & balances', adjust: 'Adjust', recentActivity: 'Recent activity', total: 'total', sendReply: 'Send reply',
  replyPlaceholder: 'Write a clear, helpful reply…', createClient: 'Create client profile', namePlaceholder: "Enter the client's full name", shownUsername: 'Shown as @username',
  email: 'Email', contactEmail: 'Required contact email', requiredCodes: 'Required confirmation codes', createHint: 'A temporary password and the requested one-time codes are generated securely. The password is shown once.',
  cancel: 'Cancel', creating: 'Creating…', createProfile: 'Create profile', temporaryCredentials: 'Temporary credentials', passwordOnce: 'This password is shown only once. Copy it before closing this window.',
  login: 'Login', temporaryPassword: 'Temporary password', copyCredentials: 'Copy login and password', adjustBalance: 'Set client balance', currentBalance: 'Current balance',
  creditAmount: 'Credit amount', balanceAmount: 'New balance in', applying: 'Applying…', applyCredit: 'Apply credit', setBalance: 'Set balance', clearConfirm: 'Clear all confirmation codes for this client? This action cannot be undone.',
  copiedError: "Couldn't copy the code. Please copy it manually.", cleared: 'Confirmation codes cleared', confirmationDisabled: 'Confirmation turned off',
  statusConfirm: 'this profile? The client will be signed out and unable to use the wallet.', statusChanged: 'Profile status changed to', generated: 'generated',
  needMoreCodes: 'Generate {count} more unused {noun} to satisfy this requirement.', remaining: '{count} to go before the transfer completes.',
  requiredNow: 'Client now needs {count} {noun}', language: 'Language', english: 'EN', ukrainian: 'UK', russian: 'RU',
  monthsLocale: 'en-US', noAvailableCodes: 'No unused confirmation codes are available. Ask the moderator to generate more.',
  editSettings: 'Edit client settings', shownAt: 'Shown with an @ sign', dailyLimit: 'Daily send limit', monthlyLimit: 'Monthly limit',
  reviewThreshold: 'Manual verification threshold', clientTheme: 'Client theme', dark: 'Dark', light: 'Light', notificationSounds: 'Notification sounds',
  saving: 'Saving…', saveSettings: 'Save settings', settingsUpdated: 'Client settings updated', client: 'Client', asset: 'Asset', amount: 'Amount', amountIn: 'Amount in',
  progress: '{used} of {required} codes entered', showAll: 'Show all', freezeAction: 'Freeze', deleteAction: 'Archive',
  errorRegistered: 'Username or email is already registered', errorLowerUsed: 'Required codes cannot be lower than the number already used',
  errorClearActive: 'Codes cannot be cleared during an active transfer', errorCodeLimit: 'A profile can have at most 1000 ready codes', errorClientMissing: 'Client not found',
  depositRequests: 'Deposit requests', pendingReview: 'pending', noDepositRequests: 'No deposit requests yet', pendingDeposit: 'Pending review', approvedDeposit: 'Approved', rejectedDeposit: 'Rejected', approveDeposit: 'Verify & approve', rejectDeposit: 'Reject', depositApproved: 'Deposit verified and approved', depositRejected: 'Deposit request rejected',
  editCredit: 'Edit manual credit', creditDate: 'Credit date and time', saveCredit: 'Save credit', creditUpdated: 'Manual credit updated',
  creditEditHint: 'Changing the amount updates the current wallet balance by the difference.', errorTransactionMissing: 'Transaction not found',
  errorManualCreditOnly: 'Only manual credits can be edited', errorCreditBeforeAccount: 'Credit date cannot be before account creation',
  errorCreditFuture: 'Credit date cannot be in the future', errorCreditUnavailable: 'The credit cannot be reduced by more than the available wallet balance.',
  adjustedAsset: 'Adjusted {asset} balance', receivedAsset: 'Received {asset}', sentAsset: 'Sent {asset}', boughtAsset: 'Bought {asset}', swappedAssets: 'Swapped {asset} to {target}', withdrawalAsset: 'Withdrew {asset}',
  deleteAccount: 'Delete account', deletingAccount: 'Deleting…', deleteAccountConfirm: 'Permanently delete this client account and all of its data? This action cannot be undone.', accountDeletedPermanently: 'Client account permanently deleted',
  loadingOperations: 'Loading Operations…', closeDialog: 'Close dialog', unexpectedError: 'Something went wrong. Try again.',
} as const

type StaffTextKey = keyof typeof en

const ru: Record<StaffTextKey, string> = {
  clients: 'Клиенты', analytics: 'Аналитика', workspace: 'Рабочее пространство', soon: 'Скоро', moderator: 'Модератор', signOut: 'Выйти',
  totalClients: 'Всего клиентов', managedPortfolio: 'Портфель под управлением', needsReply: 'Ждут ответа', transactions: 'Транзакции',
  new: 'Создать', searchClients: 'Поиск клиентов', loadingClients: 'Загрузка клиентов…', noMatchingClients: 'Клиенты не найдены',
  searchHint: 'Попробуйте другое имя, логин, почту или ID.', selectClient: 'Выберите клиента', selectClientHint: 'Выберите аккаунт в списке, чтобы открыть рабочую область.',
  noConversation: 'Переписки ещё нет', reply: 'Ответить', previousPage: 'Предыдущая страница клиентов', nextPage: 'Следующая страница клиентов', of: 'из',
  overview: 'Обзор', conversation: 'Переписка', activity: 'Активность', openAsClient: 'Открыть как клиент', opening: 'Открываем…',
  openNavigation: 'Открыть навигацию', closeNavigation: 'Закрыть навигацию', backToClients: 'Назад к клиентам', clientWorkspace: 'Рабочая область клиента', activeOnly: 'Открыть можно только активный профиль',
  confirmationCodes: 'Коды подтверждения', unused: 'не использовано', clearAllCodes: 'Очистить все коды', confirmationOff: 'Подтверждение отключено',
  confirmationOffHint: 'Коды существуют, но клиенту не нужно их вводить. Задайте требование, чтобы включить проверку.', verificationComplete: 'Проверка завершена',
  verificationCompleteHint: 'Клиент ввёл все коды, необходимые для перевода.', codesRequired: 'Нужно кодов', codesEntered: 'Введено кодов',
  notSaved: 'Не сохранено — нажмите Enter или кликните вне поля.', copied: 'Скопировано', copy: 'Копировать', everyCodeUsed: 'Все коды использованы',
  noCodes: 'Кодов пока нет', used: 'Использован', copyCode: 'Копировать код', showFewer: 'Свернуть', generate: 'Создать', code: 'код', codes: 'кодов',
  clientProfile: 'Профиль клиента', clientName: 'Имя клиента', username: 'Логин', emailAddress: 'Электронная почта', clientSince: 'Клиент с',
  clientId: 'ID клиента', profileStatus: 'Статус профиля', active: 'Активен', frozen: 'Заморожен', deleted: 'В архиве', resetPassword: 'Сбросить временный пароль',
  walletsBalances: 'Кошельки и балансы', adjust: 'Изменить', recentActivity: 'Последняя активность', total: 'всего', sendReply: 'Отправить ответ',
  replyPlaceholder: 'Напишите понятный и полезный ответ…', createClient: 'Создание профиля клиента', namePlaceholder: 'Введите полное имя клиента', shownUsername: 'Отображается как @username',
  email: 'Почта', contactEmail: 'Контактный адрес', requiredCodes: 'Необходимые коды подтверждения', createHint: 'Временный пароль и одноразовые коды будут созданы безопасно. Пароль показывается один раз.',
  cancel: 'Отмена', creating: 'Создаём…', createProfile: 'Создать профиль', temporaryCredentials: 'Временные данные для входа', passwordOnce: 'Этот пароль показывается только один раз. Скопируйте его перед закрытием окна.',
  login: 'Логин', temporaryPassword: 'Временный пароль', copyCredentials: 'Скопировать логин и пароль', adjustBalance: 'Установить баланс клиента', currentBalance: 'Текущий баланс',
  creditAmount: 'Сумма пополнения', balanceAmount: 'Новый баланс в', applying: 'Применяем…', applyCredit: 'Пополнить', setBalance: 'Установить баланс', clearConfirm: 'Удалить все коды подтверждения этого клиента? Это действие нельзя отменить.',
  copiedError: 'Не удалось скопировать код. Скопируйте его вручную.', cleared: 'Коды подтверждения удалены', confirmationDisabled: 'Подтверждение отключено',
  statusConfirm: 'этот профиль? Клиент выйдет из системы и не сможет использовать кошелёк.', statusChanged: 'Статус профиля изменён:', generated: 'создано',
  needMoreCodes: 'Создайте ещё {count} неиспользованных {noun}, чтобы выполнить требование.', remaining: 'Осталось кодов: {count}.',
  requiredNow: 'Теперь клиенту нужно кодов: {count}', language: 'Язык', english: 'EN', ukrainian: 'UK', russian: 'RU',
  monthsLocale: 'ru-RU', noAvailableCodes: 'Нет доступных неиспользованных кодов. Попросите модератора создать новые.',
  editSettings: 'Настройки клиента', shownAt: 'Отображается со знаком @', dailyLimit: 'Дневной лимит отправки', monthlyLimit: 'Месячный лимит',
  reviewThreshold: 'Порог ручной проверки', clientTheme: 'Тема клиента', dark: 'Тёмная', light: 'Светлая', notificationSounds: 'Звуки уведомлений',
  saving: 'Сохраняем…', saveSettings: 'Сохранить настройки', settingsUpdated: 'Настройки клиента обновлены', client: 'Клиент', asset: 'Актив', amount: 'Количество', amountIn: 'Сумма в',
  progress: 'Введено кодов: {used} из {required}', showAll: 'Показать все', freezeAction: 'Заморозить', deleteAction: 'Архивировать',
  errorRegistered: 'Логин или почта уже зарегистрированы', errorLowerUsed: 'Количество кодов не может быть меньше числа уже использованных',
  errorClearActive: 'Нельзя очистить коды во время активного перевода', errorCodeLimit: 'У профиля может быть не более 1000 готовых кодов', errorClientMissing: 'Клиент не найден',
  depositRequests: 'Заявки на пополнение', pendingReview: 'на проверке', noDepositRequests: 'Заявок на пополнение пока нет', pendingDeposit: 'Ожидает проверки', approvedDeposit: 'Одобрена', rejectedDeposit: 'Отклонена', approveDeposit: 'Проверить и одобрить', rejectDeposit: 'Отклонить', depositApproved: 'Пополнение проверено и одобрено', depositRejected: 'Заявка на пополнение отклонена',
  editCredit: 'Редактирование зачисления', creditDate: 'Дата и время зачисления', saveCredit: 'Сохранить зачисление', creditUpdated: 'Зачисление обновлено',
  creditEditHint: 'Изменение количества скорректирует текущий баланс кошелька на разницу.', errorTransactionMissing: 'Транзакция не найдена',
  errorManualCreditOnly: 'Редактировать можно только ручные зачисления', errorCreditBeforeAccount: 'Дата зачисления не может быть раньше создания аккаунта',
  errorCreditFuture: 'Дата зачисления не может быть в будущем', errorCreditUnavailable: 'Нельзя уменьшить зачисление больше, чем позволяет текущий баланс кошелька.',
  adjustedAsset: 'Скорректирован баланс {asset}', receivedAsset: 'Получено {asset}', sentAsset: 'Отправлено {asset}', boughtAsset: 'Куплено {asset}', swappedAssets: 'Обмен {asset} на {target}', withdrawalAsset: 'Выведено {asset}',
  deleteAccount: 'Удалить аккаунт', deletingAccount: 'Удаляем…', deleteAccountConfirm: 'Навсегда удалить аккаунт клиента и все его данные? Это действие нельзя отменить.', accountDeletedPermanently: 'Аккаунт клиента удалён навсегда',
  loadingOperations: 'Загрузка Operations…', closeDialog: 'Закрыть окно', unexpectedError: 'Что-то пошло не так. Попробуйте ещё раз.',
}

const uk: Record<StaffTextKey, string> = {
  clients: 'Клієнти', analytics: 'Аналітика', workspace: 'Робочий простір', soon: 'Незабаром', moderator: 'Модератор', signOut: 'Вийти',
  totalClients: 'Усього клієнтів', managedPortfolio: 'Портфель під управлінням', needsReply: 'Очікують відповіді', transactions: 'Транзакції',
  new: 'Створити', searchClients: 'Пошук клієнтів', loadingClients: 'Завантаження клієнтів…', noMatchingClients: 'Клієнтів не знайдено',
  searchHint: 'Спробуйте інше ім’я, логін, пошту або ID.', selectClient: 'Виберіть клієнта', selectClientHint: 'Виберіть акаунт у списку, щоб відкрити робочу область.',
  noConversation: 'Листування ще немає', reply: 'Відповісти', previousPage: 'Попередня сторінка клієнтів', nextPage: 'Наступна сторінка клієнтів', of: 'з',
  overview: 'Огляд', conversation: 'Листування', activity: 'Активність', openAsClient: 'Відкрити як клієнт', opening: 'Відкриваємо…',
  openNavigation: 'Відкрити навігацію', closeNavigation: 'Закрити навігацію', backToClients: 'Назад до клієнтів', clientWorkspace: 'Робоча область клієнта', activeOnly: 'Відкрити можна лише активний профіль',
  confirmationCodes: 'Коди підтвердження', unused: 'не використано', clearAllCodes: 'Очистити всі коди', confirmationOff: 'Підтвердження вимкнено',
  confirmationOffHint: 'Коди існують, але клієнту не потрібно їх вводити. Задайте вимогу, щоб увімкнути перевірку.', verificationComplete: 'Перевірку завершено',
  verificationCompleteHint: 'Клієнт ввів усі коди, необхідні для переказу.', codesRequired: 'Потрібно кодів', codesEntered: 'Введено кодів',
  notSaved: 'Не збережено — натисніть Enter або клацніть поза полем.', copied: 'Скопійовано', copy: 'Копіювати', everyCodeUsed: 'Усі коди використано',
  noCodes: 'Кодів поки немає', used: 'Використаний', copyCode: 'Копіювати код', showFewer: 'Згорнути', generate: 'Створити', code: 'код', codes: 'кодів',
  clientProfile: 'Профіль клієнта', clientName: 'Ім’я клієнта', username: 'Логін', emailAddress: 'Електронна пошта', clientSince: 'Клієнт із',
  clientId: 'ID клієнта', profileStatus: 'Статус профілю', active: 'Активний', frozen: 'Заморожений', deleted: 'В архіві', resetPassword: 'Скинути тимчасовий пароль',
  walletsBalances: 'Гаманці та баланси', adjust: 'Змінити', recentActivity: 'Остання активність', total: 'усього', sendReply: 'Надіслати відповідь',
  replyPlaceholder: 'Напишіть зрозумілу й корисну відповідь…', createClient: 'Створення профілю клієнта', namePlaceholder: 'Введіть повне ім’я клієнта', shownUsername: 'Відображається як @username',
  email: 'Пошта', contactEmail: 'Контактна адреса', requiredCodes: 'Необхідні коди підтвердження', createHint: 'Тимчасовий пароль і одноразові коди буде створено безпечно. Пароль показується один раз.',
  cancel: 'Скасувати', creating: 'Створюємо…', createProfile: 'Створити профіль', temporaryCredentials: 'Тимчасові дані для входу', passwordOnce: 'Цей пароль показується лише один раз. Скопіюйте його перед закриттям вікна.',
  login: 'Логін', temporaryPassword: 'Тимчасовий пароль', copyCredentials: 'Копіювати логін і пароль', adjustBalance: 'Встановити баланс клієнта', currentBalance: 'Поточний баланс',
  creditAmount: 'Сума поповнення', balanceAmount: 'Новий баланс у', applying: 'Застосовуємо…', applyCredit: 'Поповнити', setBalance: 'Встановити баланс', clearConfirm: 'Видалити всі коди підтвердження цього клієнта? Цю дію не можна скасувати.',
  copiedError: 'Не вдалося скопіювати код. Скопіюйте його вручну.', cleared: 'Коди підтвердження видалено', confirmationDisabled: 'Підтвердження вимкнено',
  statusConfirm: 'цей профіль? Клієнт вийде із системи й не зможе користуватися гаманцем.', statusChanged: 'Статус профілю змінено:', generated: 'створено',
  needMoreCodes: 'Створіть ще {count} невикористаних {noun}, щоб виконати вимогу.', remaining: 'Залишилося кодів: {count}.', requiredNow: 'Тепер клієнту потрібно кодів: {count}',
  language: 'Мова', english: 'EN', ukrainian: 'UK', russian: 'RU', monthsLocale: 'uk-UA', noAvailableCodes: 'Немає доступних невикористаних кодів. Попросіть модератора створити нові.',
  editSettings: 'Налаштування клієнта', shownAt: 'Відображається зі знаком @', dailyLimit: 'Денний ліміт надсилання', monthlyLimit: 'Місячний ліміт', reviewThreshold: 'Поріг ручної перевірки', clientTheme: 'Тема клієнта', dark: 'Темна', light: 'Світла', notificationSounds: 'Звуки сповіщень',
  saving: 'Зберігаємо…', saveSettings: 'Зберегти налаштування', settingsUpdated: 'Налаштування клієнта оновлено', client: 'Клієнт', asset: 'Актив', amount: 'Кількість', amountIn: 'Сума в',
  progress: 'Введено кодів: {used} з {required}', showAll: 'Показати всі', freezeAction: 'Заморозити', deleteAction: 'Архівувати',
  errorRegistered: 'Логін або пошта вже зареєстровані', errorLowerUsed: 'Кількість кодів не може бути меншою за число вже використаних', errorClearActive: 'Не можна очистити коди під час активного переказу', errorCodeLimit: 'Профіль може мати не більше 1000 готових кодів', errorClientMissing: 'Клієнта не знайдено',
  depositRequests: 'Заявки на поповнення', pendingReview: 'на перевірці', noDepositRequests: 'Заявок на поповнення ще немає', pendingDeposit: 'Очікує перевірки', approvedDeposit: 'Схвалена', rejectedDeposit: 'Відхилена', approveDeposit: 'Перевірити й схвалити', rejectDeposit: 'Відхилити', depositApproved: 'Поповнення перевірено та схвалено', depositRejected: 'Заявку на поповнення відхилено',
  editCredit: 'Редагування зарахування', creditDate: 'Дата й час зарахування', saveCredit: 'Зберегти зарахування', creditUpdated: 'Зарахування оновлено',
  creditEditHint: 'Зміна кількості скоригує поточний баланс гаманця на різницю.', errorTransactionMissing: 'Транзакцію не знайдено',
  errorManualCreditOnly: 'Редагувати можна лише ручні зарахування', errorCreditBeforeAccount: 'Дата зарахування не може бути раніше створення акаунта',
  errorCreditFuture: 'Дата зарахування не може бути в майбутньому', errorCreditUnavailable: 'Не можна зменшити зарахування більше, ніж дозволяє поточний баланс гаманця.',
  adjustedAsset: 'Скориговано баланс {asset}', receivedAsset: 'Отримано {asset}', sentAsset: 'Надіслано {asset}', boughtAsset: 'Придбано {asset}', swappedAssets: 'Обмін {asset} на {target}', withdrawalAsset: 'Виведено {asset}',
  deleteAccount: 'Видалити акаунт', deletingAccount: 'Видаляємо…', deleteAccountConfirm: 'Назавжди видалити акаунт клієнта та всі його дані? Цю дію не можна скасувати.', accountDeletedPermanently: 'Акаунт клієнта видалено назавжди',
  loadingOperations: 'Завантаження Operations…', closeDialog: 'Закрити вікно', unexpectedError: 'Щось пішло не так. Спробуйте ще раз.',
}

export function translateStaff(locale: StaffLocale, key: StaffTextKey, values?: Record<string, string | number>) {
  let value: string = ({ en, uk, ru })[locale][key]
  for (const [name, replacement] of Object.entries(values || {})) {
    value = value.replace(`{${name}}`, String(replacement))
  }
  return value
}

export type StaffTranslator = (key: StaffTextKey, values?: Record<string, string | number>) => string

const StaffI18nContext = createContext<{ locale: StaffLocale; t: StaffTranslator }>({
  locale: 'ru',
  t: (key, values) => translateStaff('ru', key, values),
})

export const StaffI18nProvider = StaffI18nContext.Provider
export function useStaffI18n() { return useContext(StaffI18nContext) }
