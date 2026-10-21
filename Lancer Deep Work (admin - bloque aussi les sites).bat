@echo off
powershell -NoProfile -Command "Start-Process pythonw -ArgumentList '\"%~dp0deepwork.py\" --replace' -Verb RunAs"
