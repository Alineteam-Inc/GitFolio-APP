# GitFolio app

**GitFolio in your menu bar or system tray — without a terminal.**

The GitFolio app by [Alineteam Inc.](https://aline.team) (macOS, Linux, Windows) sets up and runs
[GitFolio](https://github.com/Alineteam-Inc/GitFolio-CLI), which sends metadata of the commits you
authored and pushed to [aline.team](https://aline.team) to build your developer profile. Your developer
type, tech stack and last sync are one click away; setup, login, repositories and settings are in its
window. It carries its own `gitfolio`, so nothing else needs installing.
[Latest release](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest) · [한국어](#한국어)

## Install

Download the package for your system from the latest release:

| System | Package |
|---|---|
| macOS, Apple silicon | [GitFolio_macos_arm64.dmg](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_macos_arm64.dmg) |
| macOS, Intel | [GitFolio_macos_x64.dmg](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_macos_x64.dmg) |
| Windows 10 and 11 | [GitFolio_windows_x64-setup.exe](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_windows_x64-setup.exe) |
| Debian, Ubuntu | [GitFolio_linux_amd64.deb](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_amd64.deb) · [arm64](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_arm64.deb) |
| Fedora, openSUSE | [GitFolio_linux_amd64.rpm](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_amd64.rpm) · [arm64](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_arm64.rpm) |

**macOS:** open the `.dmg` and drag GitFolio to Applications. The app is not signed by Apple yet, so
macOS stops it the first time: choose Done, then in System Settings › Privacy & Security choose
Open Anyway next to "GitFolio was blocked". Or, in a terminal:
`xattr -dr com.apple.quarantine /Applications/GitFolio.app`.

**Windows:** run the setup. It is not signed yet, so SmartScreen may warn: choose More info › Run anyway.
The setup puts GitFolio's folder on your PATH, for the git hooks to find `gitfolio`.

**Linux:**

```sh
curl -LO https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_amd64.deb
sudo apt install ./GitFolio_linux_amd64.deb
```

or `sudo dnf install ./GitFolio_linux_amd64.rpm`. The tray icon needs AppIndicator support (on GNOME,
the "AppIndicator and KStatusNotifierItem Support" extension); its menu opens the GitFolio window.

**Update:** install the newer package over the old one; your settings and repositories stay.

**Check a download:** every release has `checksums.txt`, and
`gh attestation verify <package> -R Alineteam-Inc/GitFolio-GUI` proves a package was built from this source.

## Get started

Start GitFolio. The first time, its setup opens by itself: the data policy, git and `gitfolio`, sign-up
or login with an email code, the repositories to collect, and how to sync. After that, GitFolio lives
in the menu bar (macOS) or the system tray (Windows, Linux) and starts with your computer, which you
can turn off in its settings.

What is collected, and what never is, is the same as for the command line: see
[GitFolio's README](https://github.com/Alineteam-Inc/GitFolio-CLI#nothing-is-collected-without-your-permission).
The app uses a `gitfolio` you installed on your own (Homebrew, the install script) when it is 0.6.0
or newer; otherwise it uses its own.

## Uninstall

Open GitFolio › About › Uninstall first: it removes the git hooks GitFolio added (putting back the
ones that were there before), its daily sync and this computer's login. Your data on aline.team stays.
On macOS that removes the app too. On Windows, then remove GitFolio in Settings › Apps › Installed
apps; on Linux, `sudo apt remove git-folio` or `sudo dnf remove git-folio`.

## License and name

The code is under the [Apache License 2.0](LICENSE). The **name "GitFolio", "aline.team", their logos
and the developer type icons are not part of the license**: a modified or forked version must use its
own name, logo and icons and must not suggest that Alineteam made or endorses it. Using the aline.team
API is subject to the [aline.team Terms of Service](https://aline.team/terms).

Tech icons from [Devicon](https://devicon.dev) (MIT), see [src/icons/tech](src/icons/tech).

© 2026 Alineteam Inc.

## 한국어

GitFolio 앱은 터미널 없이 메뉴 막대나 시스템 트레이에서 [GitFolio](https://github.com/Alineteam-Inc/GitFolio-CLI)를
설정하고 실행하는 앱입니다 (Alineteam Inc., macOS·Linux·Windows). GitFolio는 내가 작성하고 push한 커밋의
메타데이터를 [aline.team](https://aline.team)으로 보내 개발 프로필을 만들어 줍니다. 개발자 유형, 기술 스택,
마지막 동기화를 클릭 한 번으로 보고, 설정·로그인·저장소 관리는 창에서 합니다. 앱 안에 `gitfolio`가 들어
있어 따로 설치할 것이 없습니다.

### 설치

최신 릴리스에서 내 시스템에 맞는 패키지를 받습니다.

| 시스템 | 패키지 |
|---|---|
| macOS, Apple 실리콘 | [GitFolio_macos_arm64.dmg](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_macos_arm64.dmg) |
| macOS, Intel | [GitFolio_macos_x64.dmg](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_macos_x64.dmg) |
| Windows 10·11 | [GitFolio_windows_x64-setup.exe](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_windows_x64-setup.exe) |
| Debian, Ubuntu | [GitFolio_linux_amd64.deb](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_amd64.deb) · [arm64](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_arm64.deb) |
| Fedora, openSUSE | [GitFolio_linux_amd64.rpm](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_amd64.rpm) · [arm64](https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_arm64.rpm) |

**macOS:** `.dmg`를 열고 GitFolio를 응용 프로그램 폴더로 끌어 놓습니다. 아직 Apple 서명이 없어 처음 열 때
macOS가 막습니다. 완료를 누른 뒤 시스템 설정 › 개인정보 보호 및 보안에서 "GitFolio이(가) 차단되었습니다" 옆의
그래도 열기를 누르세요. 터미널에서는 `xattr -dr com.apple.quarantine /Applications/GitFolio.app`.

**Windows:** 설치 프로그램을 실행합니다. 아직 서명이 없어 SmartScreen이 경고할 수 있습니다. 추가 정보 ›
실행을 누르세요. 설치 프로그램은 git 훅이 `gitfolio`를 찾을 수 있도록 GitFolio 폴더를 PATH에 넣습니다.

**Linux:**

```sh
curl -LO https://github.com/Alineteam-Inc/GitFolio-GUI/releases/latest/download/GitFolio_linux_amd64.deb
sudo apt install ./GitFolio_linux_amd64.deb
```

또는 `sudo dnf install ./GitFolio_linux_amd64.rpm`. 트레이 아이콘에는 AppIndicator 지원이 필요합니다
(GNOME에서는 "AppIndicator and KStatusNotifierItem Support" 확장). 아이콘 메뉴에서 GitFolio 창을 엽니다.

**업데이트:** 새 패키지를 기존 것 위에 설치하면 됩니다. 설정과 저장소는 그대로 남습니다.

**내려받은 파일 확인:** 릴리스마다 `checksums.txt`가 있고,
`gh attestation verify <패키지> -R Alineteam-Inc/GitFolio-GUI`로 이 소스에서 빌드된 것인지 확인할 수 있습니다.

### 시작하기

GitFolio를 실행합니다. 처음에는 설정이 저절로 열립니다. 데이터 정책, git과 `gitfolio`, 이메일 코드로
가입·로그인, 수집할 저장소, 동기화 방식 순서입니다. 그 뒤로 GitFolio는 메뉴 막대(macOS)나 시스템
트레이(Windows, Linux)에 있고 컴퓨터와 함께 시작합니다. 이는 설정에서 끌 수 있습니다.

수집하는 것과 절대 수집하지 않는 것은 명령줄과 같습니다.
[GitFolio README](https://github.com/Alineteam-Inc/GitFolio-CLI#nothing-is-collected-without-your-permission)를
보세요. 따로 설치한 `gitfolio`(Homebrew, 설치 스크립트)가 0.6.0 이상이면 앱이 그것을 쓰고, 아니면 앱에
들어 있는 것을 씁니다.

### 제거

먼저 GitFolio › 정보 › 제거를 실행합니다. GitFolio가 추가한 git 훅을 지우고(원래 있던 훅은 되돌립니다),
매일 동기화와 이 컴퓨터의 로그인을 지웁니다. aline.team의 데이터는 그대로 남습니다. macOS에서는 앱도
함께 지워집니다. Windows에서는 그다음 설정 › 앱 › 설치된 앱에서 GitFolio를 지우고, Linux에서는
`sudo apt remove git-folio` 또는 `sudo dnf remove git-folio`를 실행하세요.

### 라이선스와 이름

코드는 [Apache License 2.0](LICENSE)을 따릅니다. **"GitFolio", "aline.team" 이름과 로고, 개발자 유형
아이콘은 라이선스에 포함되지 않습니다.** 수정하거나 포크한 버전은 자체 이름·로고·아이콘을 써야 하며,
Alineteam이 만들었거나 보증한다고 오해하게 해서는 안 됩니다. aline.team API 사용은
[aline.team 이용약관](https://aline.team/terms)을 따릅니다.

기술 아이콘은 [Devicon](https://devicon.dev)(MIT)에서 가져왔습니다. [src/icons/tech](src/icons/tech)를 보세요.

© 2026 Alineteam Inc.
