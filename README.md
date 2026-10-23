# GitFolio app

**GitFolio in your menu bar or system tray — without a terminal.**

The GitFolio app by [Alineteam Inc.](https://aline.team) (macOS, Linux, Windows) sets up and runs
[GitFolio](https://github.com/Alineteam-Inc/GitFolio-CLI), which sends metadata of the commits you
authored and pushed to [aline.team](https://aline.team) to build your developer profile. Your developer
type, tech stack and last sync are one click away; setup, login, repositories and settings are in its
window. It carries its own GitFolio CLI (`gitfolio`), so nothing else needs installing.
[Latest release](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest) · [한국어](#한국어)

## Install

Every way installs the same app, with its own GitFolio CLI.

### From the command line

**macOS**, with [Homebrew](https://brew.sh):

```sh
brew install --cask alineteam-inc/tap/gitfolio-app
```

**Windows**, in PowerShell (for you only, without questions; then start GitFolio from the Start menu):

```powershell
$f = "$env:TEMP\GitFolio_windows_x64-setup.exe"
irm https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_windows_x64-setup.exe -OutFile $f
Start-Process $f /S -Wait
```

**Debian, Ubuntu**, from GitFolio's apt repository (added once; `apt upgrade` then updates it too):

```sh
sudo install -d /etc/apt/keyrings
sudo curl -fsSLo /etc/apt/keyrings/gitfolio.asc https://alineteam-inc.github.io/GitFolio-APP/gitfolio.asc
echo "deb [signed-by=/etc/apt/keyrings/gitfolio.asc] https://alineteam-inc.github.io/GitFolio-APP/apt stable main" | sudo tee /etc/apt/sources.list.d/gitfolio.list
sudo apt update && sudo apt install git-folio
```

**Fedora**, from GitFolio's dnf repository (added once; `dnf upgrade` then updates it too):

```sh
printf '[gitfolio]\nname=GitFolio\nbaseurl=https://alineteam-inc.github.io/GitFolio-APP/rpm\nrepo_gpgcheck=1\ngpgcheck=0\ngpgkey=https://alineteam-inc.github.io/GitFolio-APP/gitfolio.asc\n' | sudo tee /etc/yum.repos.d/gitfolio.repo
sudo dnf install git-folio
```

### From a package file

Download it from the [latest release](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest):

| System | Package | Install |
|---|---|---|
| macOS, Apple silicon | [GitFolio_macos_arm64.dmg](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_macos_arm64.dmg) | Open it; drag GitFolio to Applications |
| macOS, Intel | [GitFolio_macos_x64.dmg](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_macos_x64.dmg) | Open it; drag GitFolio to Applications |
| Windows 10, 11 (x64) | [GitFolio_windows_x64-setup.exe](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_windows_x64-setup.exe) | Run it |
| Debian, Ubuntu (x64) | [GitFolio_linux_amd64.deb](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_linux_amd64.deb) | `sudo apt install ./GitFolio_linux_amd64.deb` |
| Debian, Ubuntu (arm64) | [GitFolio_linux_arm64.deb](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_linux_arm64.deb) | `sudo apt install ./GitFolio_linux_arm64.deb` |
| Fedora (x64) | [GitFolio_linux_amd64.rpm](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_linux_amd64.rpm) | `sudo dnf install ./GitFolio_linux_amd64.rpm` |
| Fedora (arm64) | [GitFolio_linux_arm64.rpm](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_linux_arm64.rpm) | `sudo dnf install ./GitFolio_linux_arm64.rpm` |
| openSUSE (x64, arm64) | the Fedora `.rpm` above | `sudo zypper install ./GitFolio_linux_amd64.rpm` |

Every release has `checksums.txt`, and `gh attestation verify <package> -R Alineteam-Inc/GitFolio-APP`
proves a package was built from this source.

### On each system

| System | |
|---|---|
| macOS | Signed with Apple's Developer ID and notarized by Apple: it opens like any other app. |
| Windows | Not signed yet: SmartScreen may warn about the downloaded setup (choose More info › Run anyway); the PowerShell install does not ask. Either puts GitFolio's folder on your PATH, for the git hooks to find the GitFolio CLI. |
| Linux | The tray icon needs AppIndicator support (on GNOME, the "AppIndicator and KStatusNotifierItem Support" extension); its menu opens the GitFolio window. |

## Update

GitFolio looks for a new version when it starts and once a day, and asks before updating. It checks the
download's signature, installs it (on Linux, after your password) and starts again; your settings and
repositories stay. Installing a newer package over the old one works too, as does `apt upgrade` or
`dnf upgrade` with GitFolio's repository.

## Get started

Start GitFolio. The first time, its setup opens by itself: the data policy, git and the GitFolio CLI, sign-up
or login with an email code, the repositories to collect, and how to sync. After that, GitFolio lives
in the menu bar (macOS) or the system tray (Windows, Linux) and starts with your computer, which you
can turn off in its settings.

What is collected, and what never is, is the same as for the command line: see
[GitFolio's README](https://github.com/Alineteam-Inc/GitFolio-CLI#nothing-is-collected-without-your-permission).
If you installed the GitFolio CLI on your own (Homebrew, the install script), the setup first updates it
to the newest release and the app uses it, so the computer has one version; otherwise it uses its own.

## Uninstall

Open GitFolio › About › Uninstall first: it removes the git hooks GitFolio added (putting back the
ones that were there before), its daily sync and this computer's login. Your data on aline.team stays.
Then remove the app:

| System | Remove the app |
|---|---|
| macOS | Uninstall removes it too. Installed with Homebrew: then also `brew uninstall --cask alineteam-inc/tap/gitfolio-app` |
| Windows | Settings › Apps › Installed apps › GitFolio › Uninstall |
| Debian, Ubuntu | `sudo apt remove git-folio` |
| Fedora | `sudo dnf remove git-folio` |
| openSUSE | `sudo zypper remove git-folio` |

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
마지막 동기화를 클릭 한 번으로 보고, 설정·로그인·저장소 관리는 창에서 합니다. 앱 안에 GitFolio CLI(`gitfolio`)가
들어 있어 따로 설치할 것이 없습니다.

### 설치

어느 방법이든 같은 앱이 설치되고, GitFolio CLI도 함께 들어 있습니다.

#### 명령줄로 설치

**macOS**, [Homebrew](https://brew.sh)로:

```sh
brew install --cask alineteam-inc/tap/gitfolio-app
```

**Windows**, PowerShell에서(묻는 것 없이 현재 사용자에게 설치합니다. 끝나면 시작 메뉴에서 GitFolio를 실행하세요):

```powershell
$f = "$env:TEMP\GitFolio_windows_x64-setup.exe"
irm https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_windows_x64-setup.exe -OutFile $f
Start-Process $f /S -Wait
```

**Debian, Ubuntu**, GitFolio의 apt 저장소에서(한 번 등록하면 `apt upgrade`로도 업데이트됩니다):

```sh
sudo install -d /etc/apt/keyrings
sudo curl -fsSLo /etc/apt/keyrings/gitfolio.asc https://alineteam-inc.github.io/GitFolio-APP/gitfolio.asc
echo "deb [signed-by=/etc/apt/keyrings/gitfolio.asc] https://alineteam-inc.github.io/GitFolio-APP/apt stable main" | sudo tee /etc/apt/sources.list.d/gitfolio.list
sudo apt update && sudo apt install git-folio
```

**Fedora**, GitFolio의 dnf 저장소에서(한 번 등록하면 `dnf upgrade`로도 업데이트됩니다):

```sh
printf '[gitfolio]\nname=GitFolio\nbaseurl=https://alineteam-inc.github.io/GitFolio-APP/rpm\nrepo_gpgcheck=1\ngpgcheck=0\ngpgkey=https://alineteam-inc.github.io/GitFolio-APP/gitfolio.asc\n' | sudo tee /etc/yum.repos.d/gitfolio.repo
sudo dnf install git-folio
```

#### 패키지 파일로 설치

[최신 릴리스](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest)에서 내려받습니다.

| 시스템 | 패키지 | 설치 |
|---|---|---|
| macOS, Apple 실리콘 | [GitFolio_macos_arm64.dmg](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_macos_arm64.dmg) | 열어서 GitFolio를 응용 프로그램 폴더로 끌어 놓기 |
| macOS, Intel | [GitFolio_macos_x64.dmg](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_macos_x64.dmg) | 열어서 GitFolio를 응용 프로그램 폴더로 끌어 놓기 |
| Windows 10, 11 (x64) | [GitFolio_windows_x64-setup.exe](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_windows_x64-setup.exe) | 실행 |
| Debian, Ubuntu (x64) | [GitFolio_linux_amd64.deb](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_linux_amd64.deb) | `sudo apt install ./GitFolio_linux_amd64.deb` |
| Debian, Ubuntu (arm64) | [GitFolio_linux_arm64.deb](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_linux_arm64.deb) | `sudo apt install ./GitFolio_linux_arm64.deb` |
| Fedora (x64) | [GitFolio_linux_amd64.rpm](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_linux_amd64.rpm) | `sudo dnf install ./GitFolio_linux_amd64.rpm` |
| Fedora (arm64) | [GitFolio_linux_arm64.rpm](https://github.com/Alineteam-Inc/GitFolio-APP/releases/latest/download/GitFolio_linux_arm64.rpm) | `sudo dnf install ./GitFolio_linux_arm64.rpm` |
| openSUSE (x64, arm64) | 위의 Fedora용 `.rpm` | `sudo zypper install ./GitFolio_linux_amd64.rpm` |

릴리스마다 `checksums.txt`가 있고, `gh attestation verify <패키지> -R Alineteam-Inc/GitFolio-APP`로 이 소스에서
빌드된 것인지 확인할 수 있습니다.

#### 시스템별 참고

| 시스템 | |
|---|---|
| macOS | Apple Developer ID로 서명되고 Apple의 공증을 받은 앱이라 다른 앱처럼 바로 열립니다. |
| Windows | 아직 서명이 없어, 내려받은 설치 프로그램에 SmartScreen이 경고할 수 있습니다(추가 정보 › 실행). PowerShell로 설치하면 묻지 않습니다. 어느 쪽이든 git 훅이 GitFolio CLI를 찾을 수 있도록 GitFolio 폴더를 PATH에 넣습니다. |
| Linux | 트레이 아이콘에는 AppIndicator 지원이 필요합니다(GNOME에서는 "AppIndicator and KStatusNotifierItem Support" 확장). 아이콘 메뉴에서 GitFolio 창을 엽니다. |

### 업데이트

GitFolio는 시작할 때와 하루에 한 번 새 버전을 확인하고, 업데이트할지 묻습니다. 내려받은 파일의 서명을 확인해
설치하고(Linux에서는 비밀번호를 입력한 뒤) 다시 시작합니다. 설정과 저장소는 그대로 남습니다. 새 패키지를 기존
것 위에 설치해도 되고, GitFolio 저장소를 등록했다면 `apt upgrade`나 `dnf upgrade`로도 업데이트됩니다.

### 시작하기

GitFolio를 실행합니다. 처음에는 설정이 저절로 열립니다. 데이터 정책, git과 GitFolio CLI, 이메일 코드로
가입·로그인, 수집할 저장소, 동기화 방식 순서입니다. 그 뒤로 GitFolio는 메뉴 막대(macOS)나 시스템
트레이(Windows, Linux)에 있고 컴퓨터와 함께 시작합니다. 이는 설정에서 끌 수 있습니다.

수집하는 것과 절대 수집하지 않는 것은 명령줄과 같습니다.
[GitFolio README](https://github.com/Alineteam-Inc/GitFolio-CLI#nothing-is-collected-without-your-permission)를
보세요. GitFolio CLI를 따로 설치했다면(Homebrew, 설치 스크립트) 설정이 먼저 그것을 최신 버전으로 올리고 앱이
그것을 씁니다. 한 컴퓨터에 버전이 하나만 있게 하려는 것입니다. 따로 설치한 것이 없으면 앱에 들어 있는 것을 씁니다.

### 제거

먼저 GitFolio › 정보 › 제거를 실행합니다. GitFolio가 추가한 git 훅을 지우고(원래 있던 훅은 되돌립니다),
매일 동기화와 이 컴퓨터의 로그인을 지웁니다. aline.team의 데이터는 그대로 남습니다. 그다음 앱을 지웁니다.

| 시스템 | 앱 지우기 |
|---|---|
| macOS | 제거가 앱까지 지웁니다. Homebrew로 설치했다면 이어서 `brew uninstall --cask alineteam-inc/tap/gitfolio-app` |
| Windows | 설정 › 앱 › 설치된 앱 › GitFolio › 제거 |
| Debian, Ubuntu | `sudo apt remove git-folio` |
| Fedora | `sudo dnf remove git-folio` |
| openSUSE | `sudo zypper remove git-folio` |

### 라이선스와 이름

코드는 [Apache License 2.0](LICENSE)을 따릅니다. **"GitFolio", "aline.team" 이름과 로고, 개발자 유형
아이콘은 라이선스에 포함되지 않습니다.** 수정하거나 포크한 버전은 자체 이름·로고·아이콘을 써야 하며,
Alineteam이 만들었거나 보증한다고 오해하게 해서는 안 됩니다. aline.team API 사용은
[aline.team 이용약관](https://aline.team/terms)을 따릅니다.

기술 아이콘은 [Devicon](https://devicon.dev)(MIT)에서 가져왔습니다. [src/icons/tech](src/icons/tech)를 보세요.

© 2026 Alineteam Inc.
