using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;

public static class NativeTokenProbe {
    [StructLayout(LayoutKind.Sequential)]
    struct SidAttributes { public IntPtr Sid; public uint Attributes; }
    [StructLayout(LayoutKind.Sequential)]
    struct GroupsHeader { public uint Count; public SidAttributes First; }
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, uint size, out uint needed);

    static IntPtr Info(IntPtr token, int kind) {
        uint size;
        GetTokenInformation(token, kind, IntPtr.Zero, 0, out size);
        if (size == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
        IntPtr data = Marshal.AllocHGlobal((int)size);
        if (GetTokenInformation(token, kind, data, size, out size)) return data;
        Marshal.FreeHGlobal(data);
        throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    public static uint[] Facts(uint pid) {
        const uint ProcessQueryLimitedInformation = 0x1000, TokenQuery = 8;
        IntPtr process = OpenProcess(ProcessQueryLimitedInformation, false, pid), token = IntPtr.Zero;
        if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            if (!OpenProcessToken(process, TokenQuery, out token))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            return ReadFacts(token);
        } finally {
            if (token != IntPtr.Zero) CloseHandle(token);
            CloseHandle(process);
        }
    }

    static uint[] ReadFacts(IntPtr token) {
        IntPtr groups = Info(token, 2), integrity = Info(token, 25);
        try {
            int count = Marshal.ReadInt32(groups), offset = (int)Marshal.OffsetOf(typeof(GroupsHeader), "First");
            uint administrators = 0;
            for (int index = 0; index < count; index++) {
                IntPtr address = IntPtr.Add(groups, offset + index * Marshal.SizeOf(typeof(SidAttributes)));
                SidAttributes group = (SidAttributes)Marshal.PtrToStructure(address, typeof(SidAttributes));
                if (new SecurityIdentifier(group.Sid).Value == "S-1-5-32-544") administrators = group.Attributes;
            }
            SidAttributes label = (SidAttributes)Marshal.PtrToStructure(integrity, typeof(SidAttributes));
            string[] sid = new SecurityIdentifier(label.Sid).Value.Split('-');
            return new uint[] { uint.Parse(sid[sid.Length - 1]), administrators };
        } finally {
            Marshal.FreeHGlobal(groups);
            Marshal.FreeHGlobal(integrity);
        }
    }
}
