@echo off
cd /d C:\Users\PC\Desktop\tecrubelerim
"C:\nvm4w\nodejs\node.exe" --expose-gc --max-old-space-size=2048 biz-embed-pipeline.cjs >> biz-embed-pipeline.log 2>&1
