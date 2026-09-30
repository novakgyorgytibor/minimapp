#!/usr/bin/env bash
# Android release APK: verziót emel (0.1.N, versionCode N), buildel, és az Asztalra teszi MinimApp-<verzió>.apk néven.
set -euo pipefail
cd "$(dirname "$0")/.."

NEXT=$(node -e "
const fs=require('fs');const p='app.json';const a=JSON.parse(fs.readFileSync(p));
const e=a.expo;const code=((e.android&&e.android.versionCode)||1)+1;
e.android={...e.android,versionCode:code};e.ios={...e.ios,buildNumber:String(code)};
e.version='0.1.'+code;fs.writeFileSync(p,JSON.stringify(a,null,2)+'\n');console.log(e.version);
")
echo "▶ verzió: $NEXT"

npx expo prebuild --platform android >/dev/null
export JAVA_HOME=${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk} ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}
export NODE_ENV=production
(cd android && ./gradlew assembleRelease --no-daemon -q)

rm -f "$HOME/Desktop"/MinimApp*.apk
OUT="$HOME/Desktop/MinimApp-$NEXT.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
echo "✔ $OUT"
