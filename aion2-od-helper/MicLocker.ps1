# MicLocker.ps1
$TargetVolume = 0.8

$code = @"
using System;
using System.Runtime.InteropServices;

public class Audio {
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume {
        int f(); int g(); int h(); int i();
        int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
        int GetMasterVolumeLevelScalar(out float pfLevel);
    }
    [Guid("D6660639-1587-4E43-BAF2-11113B7E537F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice { int Activate(ref Guid id, int cls, IntPtr p, out IAudioEndpointVolume v); int b(); int OpenPropertyStore(int access, out IPropertyStore p); }
    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore { int GetCount(out int count); int GetAt(int i, out PropertyKey k); int GetValue(ref PropertyKey k, out PropVariant v); }
    [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid fmtid; public UIntPtr pid; }
    [StructLayout(LayoutKind.Explicit)] struct PropVariant { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr ptr; }
    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection { int GetCount(out int count); int Item(int index, out IMMDevice device); }
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator { int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices); }
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObj { }
    static Guid iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    static PropertyKey nameKey = new PropertyKey { fmtid = new Guid("a45c2502-df5c-4734-bc55-a5759ff54676"), pid = (UIntPtr)14 };

    public static void SuperLock(float level) {
        IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObj());
        IMMDeviceCollection devices = null;
        enumerator.EnumAudioEndpoints(2, 0xF, out devices);
        int count = 0;
        devices.GetCount(out count);
        
        for (int i = 0; i < count; i++) {
            try {
                IMMDevice device = null;
                devices.Item(i, out device);
                IAudioEndpointVolume vol = null;
                device.Activate(ref iid, 7, IntPtr.Zero, out vol);
                float cur = 0;
                vol.GetMasterVolumeLevelScalar(out cur);
                if (Math.Abs(cur - level) > 0.01) {
                    vol.SetMasterVolumeLevelScalar(level, Guid.Empty);
                    IPropertyStore props;
                    device.OpenPropertyStore(0, out props);
                    PropVariant val;
                    props.GetValue(ref nameKey, out val);
                    string name = Marshal.PtrToStringUni(val.ptr);
                    Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] Locked 80%: " + name);
                }
            } catch {}
        }
    }
}
"@

Add-Type -TypeDefinition $code
Write-Host "--- Mic Locker v2.1 (Admin Mode) ---" -ForegroundColor Cyan

while($true) {
    try { [Audio]::SuperLock($TargetVolume) } catch { }
    Start-Sleep -Milliseconds 100
}
