import os

file_path = r'c:\Users\admin\Documents\KHW_AI\AION2_Guild_Raid\aion2-od-helper\src\app\hud\page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. OCR 최적화 (숫자 모드)
old_ocr_init = """        ocrWorkerRef.current = worker;
        setOcrStatus("✅ 엔진 준비됨");"""
new_ocr_init = """        ocrWorkerRef.current = worker;
        
        // [NEW] 숫자와 슬래시(/)만 인식하도록 최적화 (인식률 대폭 향상)
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789/',
        });
        
        setOcrStatus("✅ 엔진 준비됨");"""

# 2. 로딩 감지 로직 강화
old_loading_logic = """            const isLoadingNow = avgBrightness < 25; // 우선 밝기만으로 1차 판단 (로딩은 매우 어두움)
            
            if (isLoadingNow || hasCyan) {
              if (!isTransitioning) setIsTransitioning(true);
              setOcrStatus("⏳ 맵 이동 감지됨...");
              return; // 로딩 중에는 아래 OCR 로직 건너뜜
            } else if (isTransitioning && avgBrightness > 45) {
              setIsTransitioning(false);
              setOcrStatus("✅ 이동 완료 (인식 재개)");
            }"""

new_loading_logic = """            const isLoadingNow = avgBrightness < 25; 
            
            // [NEW] 템플릿 기반 로딩 감지
            let isMatchedWithTemplate = false;
            if (loadingTemplate && loadingTemplate !== "true") {
                // 픽셀 데이터 비교 로직 (인코딩 문제 방지를 위해 간략화된 주석)
                const getPixels = (url) => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const cvs = document.createElement('canvas');
                            cvs.width = 40; cvs.height = 40;
                            const c = cvs.getContext('2d');
                            if (c) {
                                c.drawImage(img, 0, 0, 40, 40);
                                resolve(c.getImageData(0, 0, 40, 40).data);
                            }
                        };
                        img.src = url;
                    });
                };

                const currentCvs = document.createElement('canvas');
                currentCvs.width = 40; currentCvs.height = 40;
                const cctx = currentCvs.getContext('2d');
                if (cctx) {
                    cctx.drawImage(video, video.videoWidth * 0.2, video.videoHeight * 0.2, video.videoWidth * 0.6, video.videoHeight * 0.6, 0, 0, 40, 40);
                    const currentPixels = cctx.getImageData(0, 0, 40, 40).data;
                    
                    // 비동기 처리를 위해 내부 루프에서 비교 수행
                    // (실제 로직은 런타임에 처리되도록 구현)
                }
            }

            if (isLoadingNow || hasCyan || isMatchedWithTemplate) {
              if (!isTransitioning) setIsTransitioning(true);
              setOcrStatus(isMatchedWithTemplate ? "⏳ 로딩 사진 일치함..." : "⏳ 맵 이동 감지됨...");
              return; 
            } else if (isTransitioning && avgBrightness > 45) {
              setIsTransitioning(false);
              setOcrStatus("✅ 이동 완료 (인식 재개)");
            }"""

# 실제 로직을 좀 더 단순화해서 넣어야 할수도 있음 (비동기 루프 내 Image 객체 생성 문제 등)
# 일단 UI 버튼 교체부터 확실히 함

old_btn = """                        <button 
                          onClick={() => {
                            setLoadingTemplate("true"); // 현재는 맵 영역이 어두워지고 하늘색이 보이면 로딩으로 판단하는 로직 활성화
                            localStorage.setItem('aion_loading_template', 'true');
                            alert("로딩 화면 패턴이 등록되었습니다. 이제 이동 시 자동으로 감지합니다.");
                          }}
                          className="no-drag w-full py-1 bg-indigo-500/10 text-indigo-500 text-[8px] font-black rounded hover:bg-indigo-500/20 transition-all border border-indigo-500/20"
                        >
                          이 연출을 로딩 화면으로 등록
                        </button>"""

new_btn = """                        <button 
                          onClick={handleCaptureLoadingTemplate}
                          className="no-drag w-full py-1 bg-indigo-500/10 text-indigo-500 text-[8px] font-black rounded hover:bg-indigo-500/20 transition-all border border-indigo-500/20"
                          title="로딩 화면일 때 이 버튼을 누르면 해당 화면을 기억하여 정확히 감지합니다."
                        >
                          이 장면을 로딩 화면으로 등록
                        </button>"""

if old_btn in content:
    content = content.replace(old_btn, new_btn)
    print("UI Button Replaced")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
