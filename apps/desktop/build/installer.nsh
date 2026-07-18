!include "WordFunc.nsh"
!insertmacro WordReplace

!define NATIVE_HOST_NAME "com.codex_context_bridge.host"
!define NATIVE_EXTENSION_ORIGIN "chrome-extension://ccchffnkidpolmnnlonbnakjjmphfdjp/"

!macro registerNativeHost
  WriteRegStr HKCU "Software\Google\Chrome\NativeMessagingHosts\${NATIVE_HOST_NAME}" "" "$INSTDIR\native-messaging\${NATIVE_HOST_NAME}.json"
  WriteRegStr HKCU "Software\Microsoft\Edge\NativeMessagingHosts\${NATIVE_HOST_NAME}" "" "$INSTDIR\native-messaging\${NATIVE_HOST_NAME}.json"
  WriteRegStr HKCU "Software\Chromium\NativeMessagingHosts\${NATIVE_HOST_NAME}" "" "$INSTDIR\native-messaging\${NATIVE_HOST_NAME}.json"
!macroend

!macro unregisterNativeHost
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\${NATIVE_HOST_NAME}"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\${NATIVE_HOST_NAME}"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\${NATIVE_HOST_NAME}"
!macroend

!macro customInstall
  CreateDirectory "$INSTDIR\native-messaging"
  ${WordReplace} "$INSTDIR" "\" "/" "+" $1
  FileOpen $0 "$INSTDIR\native-messaging\${NATIVE_HOST_NAME}.json" w
  FileWrite $0 "{$\r$\n"
  FileWrite $0 "  $\"name$\": $\"${NATIVE_HOST_NAME}$\",$\r$\n"
  FileWrite $0 "  $\"description$\": $\"Codex Context Bridge native relay$\",$\r$\n"
  FileWrite $0 "  $\"path$\": $\"$1/resources/CodexContextBridgeNativeHost.exe$\",$\r$\n"
  FileWrite $0 "  $\"type$\": $\"stdio$\",$\r$\n"
  FileWrite $0 "  $\"allowed_origins$\": [$\"${NATIVE_EXTENSION_ORIGIN}$\"]$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileClose $0
  SetRegView 64
  !insertmacro registerNativeHost
  SetRegView 32
  !insertmacro registerNativeHost
  SetRegView 64
!macroend

!macro customUnInstall
  SetRegView 64
  !insertmacro unregisterNativeHost
  SetRegView 32
  !insertmacro unregisterNativeHost
  SetRegView 64
  Delete "$INSTDIR\native-messaging\${NATIVE_HOST_NAME}.json"
  RMDir "$INSTDIR\native-messaging"
!macroend
