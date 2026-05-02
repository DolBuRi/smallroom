import os

file_path = r'c:\Users\admin\Documents\KHW_AI\AION2_Guild_Raid\aion2-od-helper\src\app\hud\page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. OCR 최적화 (숫자 모드) - 이미 있을수도 있지만 안전하게
old_ocr_init = """        ocrWorkerRef.current = worker;
        setOcrStatus("✅ 엔진 준비됨");"""
new_ocr_init = """        ocrWorkerRef.current = worker;
        
        // [NEW] 숫자와 슬래시(/)만 인식하도록 최적화
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789/',
        });
        
        setOcrStatus("✅ 엔진 준비됨");"""

if old_ocr_init in content:
    content = content.replace(old_ocr_init, new_ocr_init)
    print("OCR Init Optimized")

# 2. 로딩 감지 로직 강화
# 픽셀 데이터를 미리 가져오는 헬퍼 함수를 useEffect 밖에 선언하는 게 좋지만, 일단 인라인으로 구현

old_loading_logic = """            // 로딩 화면 특징: 전체적으로 매우 어둡거나(avg < 30), 특유의 하늘색 포인트(R<150, G>150, B>150)가 있음
            const isLoadingNow = avgBrightness < 25; // 우선 밝기만으로 1차 판단 (로딩은 매우 어두움)
            
            if (isLoadingNow || hasCyan) {
              if (!isTransitioning) setIsTransitioning(true);
              setOcrStatus("⏳ 맵 이동 감지됨...");
              return; // 로딩 중에는 아래 OCR 로직 건너뜜
            }"""

new_loading_logic = """            // 로딩 화면 특징: 전체적으로 매우 어둡거나(avg < 30), 특유의 하늘색 포인트
            const isLoadingNow = avgBrightness < 25; 
            
            // [NEW] 템플릿 기반 로딩 감지 (사용자가 등록한 사진과 비교)
            let isMatchedWithTemplate = false;
            if (loadingTemplate && loadingTemplate.startsWith("data:image")) {
                const currentCvs = document.createElement('canvas');
                currentCvs.width = 40; currentCvs.height = 40;
                const cctx = currentCvs.getContext('2d');
                if (cctx) {
                    cctx.drawImage(video, video.videoWidth * 0.2, video.videoHeight * 0.2, video.videoWidth * 0.6, video.videoHeight * 0.6, 0, 0, 40, 40);
                    const currentPixels = cctx.getImageData(0, 0, 40, 40).data;
                    
                    // loadingTemplatePixels는 미리 캐싱해두는 게 좋지만 일단 여기서 생성
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

# TargetContent 매칭을 위해 원본의 공백/줄바꿈 확인 필요
# view_file 결과:
# 634:             // 로딩 화면 특징: 전체적으로 매우 어둡거나(avg < 30), 특유의 하늘색 포인트(R<150, G>150, B>150)가 있음
# 635:             const isLoadingNow = avgBrightness < 25; // 우선 밝기만으로 1차 판단 (로딩은 매우 어두움)
# 636:             
# 637:             if (isLoadingNow || hasCyan) {
# 638:               if (!isTransitioning) setIsTransitioning(true);
# 639:               setOcrStatus("⏳ 맵 이동 감지됨...");
# 640:               return; // 로딩 중에는 아래 OCR 로직 건너뜜
# 641:             }

if old_loading_logic in content:
    content = content.replace(old_loading_logic, new_loading_logic)
    print("Loading Logic Enhanced")
else:
    print("Loading Logic NOT found - check exact match")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
