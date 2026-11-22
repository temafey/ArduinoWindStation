; Kiwi_Drop: язык установщика по РЕГИОНУ Windows («Регион» в параметрах), а не по языку системы.
; Украина — украинский; Россия, Беларусь, Казахстан — русский; все остальные — английский.
; Русская Windows в Украине даст украинский установщик, английская Windows в России — русский.
; Подключается electron-builder'ом (nsis.include в package.json); языки — nsis.installerLanguages.

!macro wkPickLanguage
  Push $0
  ; GetUserGeoID(GEOCLASS_NATION = 16): 241 Украина, 203 Россия, 29 Беларусь, 137 Казахстан
  System::Call 'kernel32::GetUserGeoID(i 16) i .r0'
  ${If} $0 == 241
    StrCpy $LANGUAGE ${LANG_UKRAINIAN}
  ${ElseIf} $0 == 203
  ${OrIf} $0 == 29
  ${OrIf} $0 == 137
    StrCpy $LANGUAGE ${LANG_RUSSIAN}
  ${Else}
    StrCpy $LANGUAGE ${LANG_ENGLISH}
  ${EndIf}
  Pop $0
!macroend

!macro preInit
  !insertmacro wkPickLanguage
!macroend

!macro customUnInit
  !insertmacro wkPickLanguage
!macroend

; Свои строки electron-builder'а (страница «для кого ставить», удаление): украинского в его
; словаре нет — там был бы английский, а у русского обращение на «ты». customHeader вставляется
; после всех словарей, поэтому эти строки заменяют их; предупреждение о повторе (6030) гасим,
; иначе сборка с -WX упадёт.
!macro customHeader
  !pragma warning push
  !pragma warning disable 6030

  LangString win7Required ${LANG_UKRAINIAN} "Потрібна Windows 7 або новіша"
  LangString x64WinRequired ${LANG_UKRAINIAN} "Потрібна 64-бітна Windows"
  LangString installing ${LANG_UKRAINIAN} "Встановлення, зачекайте..."
  LangString areYouSureToUninstall ${LANG_UKRAINIAN} "Видалити ${PRODUCT_NAME}?"
  LangString chooseInstallationOptions ${LANG_UKRAINIAN} "Параметри встановлення"
  LangString chooseUninstallationOptions ${LANG_UKRAINIAN} "Параметри видалення"
  LangString whichInstallationShouldBeRemoved ${LANG_UKRAINIAN} "Яку з установок видалити?"
  LangString whoShouldThisApplicationBeInstalledFor ${LANG_UKRAINIAN} "Для кого встановити програму?"
  LangString selectUserMode ${LANG_UKRAINIAN} "Оберіть, чи буде програма доступна всім користувачам цього комп’ютера, чи лише вам"
  LangString whichInstallationRemove ${LANG_UKRAINIAN} "Програму встановлено і для всіх користувачів, і для окремого користувача.$\r$\nЯку з установок видалити?"
  LangString freshInstallForAll ${LANG_UKRAINIAN} "Нове встановлення для всіх користувачів (знадобляться права адміністратора)."
  LangString freshInstallForCurrent ${LANG_UKRAINIAN} "Нове встановлення лише для поточного користувача."
  LangString onlyForMe ${LANG_UKRAINIAN} "Лише для &мене"
  LangString forAll ${LANG_UKRAINIAN} "Для &всіх користувачів цього комп’ютера"
  LangString loginWithAdminAccount ${LANG_UKRAINIAN} "Щоб продовжити, увійдіть в обліковий запис адміністратора..."
  LangString perUserInstallExists ${LANG_UKRAINIAN} "Програму вже встановлено для окремого користувача."
  LangString perUserInstall ${LANG_UKRAINIAN} "Програму встановлено для окремого користувача."
  LangString perMachineInstallExists ${LANG_UKRAINIAN} "Програму вже встановлено для всього комп’ютера."
  LangString perMachineInstall ${LANG_UKRAINIAN} "Програму встановлено для всього комп’ютера."
  LangString reinstallUpgrade ${LANG_UKRAINIAN} "Програму буде перевстановлено або оновлено."
  LangString uninstall ${LANG_UKRAINIAN} "Програму буде видалено."

  LangString selectUserMode ${LANG_RUSSIAN} "Выберите, будет ли программа доступна всем пользователям этого компьютера или только вам"
  LangString whichInstallationRemove ${LANG_RUSSIAN} "Программа установлена и для всех пользователей, и для отдельного пользователя.$\r$\nКакую из установок удалить?"
  LangString loginWithAdminAccount ${LANG_RUSSIAN} "Чтобы продолжить, войдите в учётную запись администратора..."
  LangString areYouSureToUninstall ${LANG_RUSSIAN} "Удалить ${PRODUCT_NAME}?"

  !pragma warning pop
!macroend
