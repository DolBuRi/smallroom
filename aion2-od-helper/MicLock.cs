using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace MicLock {
    class Program {
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {
            int f(); int g(); int h(); int i();
            int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
            int GetMasterVolumeLevelScalar(out float pfLevel);
        }
        [Guid("D6660639-1587-4E43-BAF2-11113B7E537F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice { int Activate(ref Guid id, int cls, IntPtr p, out IAudioEndpointVolume v); }
        [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceCollection { int GetCount(out int count); int Item(int index, out IMMDevice device); }
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator { int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices); }
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObj { }

        static Guid iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");

        static void Main(string[] args) {
            Console.Title = "Mic Locker v2.0 - 80% Fixed";
            Console.WriteLine("========================================");
            Console.WriteLine("   마이크 볼륨 80% 강제 고정 프로그램");
            Console.WriteLine("========================================");
            Console.WriteLine("0.1초 간격으로 모든 마이크를 감시합니다.");
            Console.WriteLine("이 창을 닫으면 종료됩니다.\n");

            float targetVolume = 0.8f;

            while (true) {
                try {
                    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObj());
                    IMMDeviceCollection devices;
                    enumerator.EnumAudioEndpoints(1, 1, out devices); // eCapture, Active
                    int count;
                    devices.GetCount(out count);

                    for (int i = 0; i < count; i++) {
                        IMMDevice device;
                        devices.Item(i, out device);
                        IAudioEndpointVolume volume;
                        device.Activate(ref iid, 7, IntPtr.Zero, out volume);
                        
                        float current;
                        volume.GetMasterVolumeLevelScalar(out current);
                        
                        if (Math.Abs(current - targetVolume) > 0.01) {
                            volume.SetMasterVolumeLevelScalar(targetVolume, Guid.Empty);
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] 복구 완료: " + Math.Round(current * 100) + "% -> 80%");
                        }
                    }
                } catch { }
                Thread.Sleep(100);
            }
        }
    }
}
