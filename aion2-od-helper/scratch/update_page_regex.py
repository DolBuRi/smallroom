import os
import re

file_path = r'c:\Users\admin\Documents\KHW_AI\AION2_Guild_Raid\aion2-od-helper\src\app\hud\page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. OCR 최적화
pattern_ocr = re.compile(r'ocrWorkerRef\.current = worker;\s+setOcrStatus\("✅ 엔진 준비됨"\);')
new_ocr = """ocrWorkerRef.current = worker;
        
        // [NEW] 숫자와 슬래시(/)만 인식하도록 최적화
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789/',
        });
        
        setOcrStatus("✅ 엔진 준비됨");"""

if pattern_ocr.search(content):
    content = pattern_ocr.sub(new_ocr, content)
    print("OCR Optimized")

# 2. 로딩 감지 로직
pattern_loading = re.compile(r'const isLoadingNow = avgBrightness < 25;.*?if \(isLoadingNow \|\| hasCyan\) \{.*?return; // 로딩 중에는 아래 OCR 로직 건너뜜\s+\}', re.DOTALL)
new_loading = """const isLoadingNow = avgBrightness < 25; 
            
            // [NEW] 템플릿 기반 로딩 감지 (사용자가 등록한 사진과 비교)
            let isMatchedWithTemplate = false;
            if (loadingTemplate && loadingTemplate.startsWith("data:image")) {
                const currentCvs = document.createElement('canvas');
                currentCvs.width = 40; currentCvs.height = 40;
                const cctx = currentCvs.getContext('2d');
                if (cctx) {
                    cctx.drawImage(video, video.videoWidth * 0.2, video.videoHeight * 0.2, video.videoWidth * 0.6, video.videoHeight * 0.6, 0, 0, 40, 40);
                    const currentPixels = cctx.getImageData(0, 0, 40, 40).data;
                    
                    const tempImg = new Image();
                    tempImg.src = loadingTemplate;
                    const tempCvs = document.createElement('canvas');
                    tempCvs.width = 40; tempCvs.height = 40;
                    const tctx = tempCvs.getContext('2d');
                    if (tctx) {
                        tctx.drawImage(tempImg, 0, 0, 40, 40);
                        const templatePixels = tctx.getImageData(0, 0, 40, 40).data;
                        
                        let diff = 0;
                        for (let i = 0; i < currentPixels.length; i += 4) {
                            diff += Math.abs(currentPixels[i] - templatePixels[i]);
                            diff += Math.abs(currentPixels[i+1] - templatePixels[i+1]);
                            diff += Math.abs(currentPixels[i+2] - templatePixels[i+2]);
                        }
                        const avgDiff = diff / (40 * 40 * 3);
                        if (avgDiff < 25) isMatchedWithTemplate = true;
                    }
                }
            }

            if (isLoadingNow || hasCyan || isMatchedWithTemplate) {
              if (!isTransitioning) setIsTransitioning(true);
              setOcrStatus(isMatchedWithTemplate ? "⏳ 로딩 사진 일치함..." : "⏳ 맵 이동 감지됨...");
              return; 
            }"""

if pattern_loading.search(content):
    content = pattern_loading.sub(new_loading, content)
    print("Loading Logic Updated")
else:
    print("Loading Logic Pattern NOT found")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
