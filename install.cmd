@echo off
echo This will install `proxy-helper.exe` as a system service.
echo Press anykey to continue, other wise please close this window.
echo You will need Administrator Privilege to install it.
pause
npm run setup
sc create proxy_163 binPath= "%~dp0\proxy-helper.exe" start= delayed-auto DisplayName= "Proxy 163"
sc description proxy_163 "A Proxy service for 163, running at port 4003."
sc start proxy_163
pause
