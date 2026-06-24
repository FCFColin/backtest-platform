@echo off
REM Rust引擎编译脚本 - 自动设置MSVC环境
REM 需要先安装 VS Build Tools + Windows SDK

set MSVC_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207
set WIN_SDK_LIB=C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0
set WIN_SDK_INC=C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0

set PATH=%MSVC_PATH%\bin\Hostx64\x64;%PATH%
set LIB=%MSVC_PATH%\lib\x64;%WIN_SDK_LIB%\um\x64;%WIN_SDK_LIB%\ucrt\x64
set INCLUDE=%MSVC_PATH%\include;%WIN_SDK_INC%\ucrt;%WIN_SDK_INC%\um;%WIN_SDK_INC%\shared

cd /d "%~dp0"
cargo build --release %*
