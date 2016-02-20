@pushd %~dp0
@node %~n0.js
@if not %ERRORLEVEL% equ 0 @pause
@popd %~dp0