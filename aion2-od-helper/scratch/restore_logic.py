import os

file_path = r'c:\Users\admin\Documents\KHW_AI\AION2_Guild_Raid\aion2-od-helper\src\app\hud\page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 복구할 코드
restoration = """                        if (diff / (40 * 40 * 3) < 25) isMatchedWithTemplate = true;
                    }
                }
            }

            if (isLoadingNow || hasCyan || isMatchedWithTemplate) {
              if (!isTransitioning) setIsTransitioning(true);
              setOcrStatus(isMatchedWithTemplate ? "⏳ 로딩 사진 일치함..." : "⏳ 맵 이동 감지됨...");
              return; 
            } else if (isTransitioning && avgBrightness > 45) {
              setIsTransitioning(false);
              setOcrStatus("✅ 이동 완료 (인식 재개)");
            }
"""

target = """                        if (diff / (40 * 40 * 3) < 25) isMatchedWithTemplate = true;
                    }
                }
            }"""

if target in content:
    content = content.replace(target, restoration)
    print("Restored and Updated Status Successfully")
else:
    print("Target NOT found for restoration")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
