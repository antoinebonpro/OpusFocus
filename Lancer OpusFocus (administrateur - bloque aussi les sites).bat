@echo off
powershell -NoProfile -Command "Start-Process pythonw -ArgumentList '\"%~dp0opusfocus.py\" --replace' -Verb RunAs"
