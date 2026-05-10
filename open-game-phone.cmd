@echo off
cd /d "%~dp0"
echo.
echo Flower Lantern Valley phone server
echo ----------------------------------
echo.
echo Use one of the IPv4 addresses below on your phone:
ipconfig | findstr /R /C:"IPv4"
echo.
echo Phone URL format:
echo   http://YOUR_IPV4_ADDRESS:5173/index.html
echo.
echo Example:
echo   http://192.168.1.25:5173/index.html
echo.
echo Keep this window open while playing on your phone.
echo If Windows Firewall asks, allow Python on Private networks.
echo.
py -m http.server 5173 --bind 0.0.0.0
