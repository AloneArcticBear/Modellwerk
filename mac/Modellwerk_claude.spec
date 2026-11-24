#claude
# PyInstaller-Bauanleitung fuer Modellwerk.app (wird von installieren_claude.command benutzt)
a = Analysis(['mw_app.py'], pathex=['.'],
             datas=[('beispiele_claude', 'beispiele_claude'), ('modellwerk_icon_claude.png', '.')],
             hiddenimports=['mw_core', 'mw_draw', 'mw_dialogs', 'mw_icons'],
             excludes=['tkinter', 'PySide6.QtWebEngineCore', 'PySide6.QtWebEngineWidgets', 'PySide6.QtQml', 'PySide6.QtQuick',
                       'PySide6.Qt3DCore', 'PySide6.QtMultimedia', 'PySide6.QtPdf', 'PySide6.QtCharts', 'PySide6.QtDataVisualization'])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='Modellwerk', console=False)
coll = COLLECT(exe, a.binaries, a.datas, name='Modellwerk')
app = BUNDLE(coll, name='Modellwerk.app', icon='Modellwerk_claude.icns', bundle_identifier='de.modellwerk.claude',
             info_plist={
                 'CFBundleDisplayName': 'Modellwerk', 'CFBundleShortVersionString': '2.0', 'NSHighResolutionCapable': True,
                 'CFBundleDocumentTypes': [{'CFBundleTypeName': 'Modell', 'CFBundleTypeRole': 'Editor', 'LSHandlerRank': 'Alternate',
                                            'CFBundleTypeExtensions': ['prg', 'PRG', 'json']}]})
