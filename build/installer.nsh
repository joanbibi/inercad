; InerCAD · ajustes del instalador (NSIS) — se incluye automáticamente al generar el instalador.

; Al desinstalar: quitar también la asociación de archivos .inercad que dejaría el sistema "huérfana"
!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\.inercad" ""
  ${If} $0 == "Proyecto InerCAD"
    DeleteRegKey HKCU "Software\Classes\.inercad"
  ${EndIf}
  ; avisar al Explorador para que refresque los iconos asociados
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
