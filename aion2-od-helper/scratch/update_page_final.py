import os

file_path = r'c:\Users\admin\Documents\KHW_AI\AION2_Guild_Raid\aion2-od-helper\src\app\hud\page.tsx'

with open(file_path, 'rb') as f:
    raw_content = f.read()

# 인코딩 무시하고 바이트 레벨에서 찾거나, 여러 인코딩 시도
try:
    content = raw_content.decode('utf-8')
except:
    content = raw_content.decode('cp949')

# 아주 간단한 교체
target = 'if (isLoadingNow || hasCyan) {'
replacement = """if (isLoadingNow || hasCyan || isMatchedWithTemplate) {
              if (!isTransitioning) setIsTransitioning(true);
              setOcrStatus(isMatchedWithTemplate ? "⏳ 로딩 사진 일치함..." : "⏳ 맵 이동 감지됨...");
              return; 
            }
            if (isLoadingNow || hasCyan) {""" # 중복 방지를 위해 패턴을 바꿈

# 그냥 덮어쓰기 방식으로 로직 삽입
insertion_point = 'const isLoadingNow = avgBrightness < 25;'
logic = """const isLoadingNow = avgBrightness < 25; 
            
            // [NEW] 템플릿 기반 로딩 감지
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
                        if (diff / (40 * 40 * 3) < 25) isMatchedWithTemplate = true;
                    }
                }
            }
"""

if insertion_point in content:
    content = content.replace(insertion_point, logic)
    # 기존 if 문도 수정
    content = content.replace('if (isLoadingNow || hasCyan) {', 'if (isLoadingNow || hasCyan || isMatchedWithTemplate) {')
    # 중복된 status 제거는 나중에
    print("Logic Inserted Successfully")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
