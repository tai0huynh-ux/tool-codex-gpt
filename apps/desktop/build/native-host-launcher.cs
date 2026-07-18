using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

internal static class NativeHostLauncher
{
    private static void Pump(Stream input, Stream output, bool closeOutput)
    {
        byte[] buffer = new byte[8192];
        try
        {
            int count;
            while ((count = input.Read(buffer, 0, buffer.Length)) > 0)
            {
                output.Write(buffer, 0, count);
                output.Flush();
            }
        }
        finally
        {
            if (closeOutput) output.Close();
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }

    public static int Main(string[] args)
    {
        string resourcesDirectory = AppDomain.CurrentDomain.BaseDirectory;
        string electronExecutable = Path.GetFullPath(Path.Combine(resourcesDirectory, "..", "CodexContextBridge.exe"));
        string hostScript = Path.Combine(resourcesDirectory, "native-host", "native-host-entry.cjs");
        if (!File.Exists(electronExecutable) || !File.Exists(hostScript)) return 2;

        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = electronExecutable,
            Arguments = string.Join(" ", new[] { Quote(hostScript) }.Concat(args.Select(Quote))),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        startInfo.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";

        using (Process child = Process.Start(startInfo))
        {
            if (child == null) return 3;
            Task input = Task.Factory.StartNew(
                () => Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream, true),
                TaskCreationOptions.LongRunning
            );
            Task output = Task.Factory.StartNew(
                () => Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput(), false),
                TaskCreationOptions.LongRunning
            );
            Task errors = Task.Factory.StartNew(
                () => Pump(child.StandardError.BaseStream, Console.OpenStandardError(), false),
                TaskCreationOptions.LongRunning
            );
            child.WaitForExit();
            Task.WaitAll(output, errors);
            return child.ExitCode;
        }
    }
}
