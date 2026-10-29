using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text.Json;

internal static class Program
{
    private const int Port = 8080;
    private static readonly string HealthUrl = $"http://127.0.0.1:{Port}/api/health";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(1) };

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr window, string text, string caption, uint type);

    private static async Task<int> Main()
    {
        try
        {
            if (!OperatingSystem.IsWindows())
            {
                throw new PlatformNotSupportedException("O Dia do Servidor é destinado ao Windows.");
            }

            await StartApplication();
            return 0;
        }
        catch (Exception error)
        {
            ShowMessage($"Não foi possível iniciar o Dia do Servidor.\n\n{error.Message}", "Dia do Servidor", 0x10);
            return 1;
        }
    }

    [SupportedOSPlatform("windows")]
    private static async Task StartApplication()
    {
        var applicationDirectory = AppContext.BaseDirectory;
        var dataDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DiaDoServidor",
            "data");
        var nodePath = Path.Combine(applicationDirectory, "runtime", "node.exe");
        var serverDirectory = Path.Combine(applicationDirectory, "server");
        var serverEntryPoint = Path.Combine(serverDirectory, "src", "server.ts");
        var tsxCli = Path.Combine(serverDirectory, "node_modules", "tsx", "dist", "cli.mjs");
        var prismaCli = Path.Combine(serverDirectory, "node_modules", "prisma", "build", "index.js");
        var frontendDirectory = Path.Combine(applicationDirectory, "frontend", "dist");
        var pidPath = Path.Combine(dataDirectory, "server.pid");

        if (!File.Exists(nodePath) || !File.Exists(serverEntryPoint) || !File.Exists(tsxCli) ||
            !File.Exists(prismaCli) || !File.Exists(Path.Combine(frontendDirectory, "index.html")))
        {
            throw new FileNotFoundException(
                "A instalação está incompleta. Reextraia a pasta DiaDoServidor sem separar seus arquivos.");
        }

        Directory.CreateDirectory(dataDirectory);

        using var startupSemaphore = new Semaphore(
            1,
            1,
            @"Local\DiaDoServidor-Launcher"
        );

        var acquiredSemaphore = false;

        try
        {
            acquiredSemaphore = startupSemaphore.WaitOne(
                TimeSpan.FromSeconds(60)
            );

            if (!acquiredSemaphore)
            {
                if (await IsApplicationRunning())
                {
                    OpenBrowser();
                    return;
                }

                throw new TimeoutException("O inicializador anterior ainda está preparando o sistema. Tente novamente.");
            }

            if (await IsApplicationRunning())
            {
                OpenBrowser();
                return;
            }

            await ApplyMigrations(nodePath, prismaCli, serverDirectory, dataDirectory);

            var startInfo = new ProcessStartInfo(nodePath)
            {
                WorkingDirectory = serverDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            startInfo.ArgumentList.Add(tsxCli);
            startInfo.ArgumentList.Add(serverEntryPoint);
            startInfo.Environment["APP_DATA_DIR"] = dataDirectory;
            startInfo.Environment.Remove("DATABASE_URL");
            startInfo.Environment["FRONTEND_DIST_DIR"] = frontendDirectory;
            startInfo.Environment["NODE_ENV"] = "production";
            startInfo.Environment["PORT"] = Port.ToString();

            using var server = Process.Start(startInfo)
                ?? throw new InvalidOperationException("O processo do servidor não foi iniciado.");
            File.WriteAllText(pidPath, server.Id.ToString());

            if (!await WaitForApplication(server))
            {
                if (File.Exists(pidPath))
                {
                    File.Delete(pidPath);
                }

                throw new InvalidOperationException(
                    $"A API não ficou disponível em {HealthUrl}. Verifique se a porta {Port} está livre.");
            }

            CreateDesktopShortcut(applicationDirectory);
            OpenBrowser();
        }
        finally
        {
            if (acquiredSemaphore)
            {
                startupSemaphore.Release();
            }
        }
    }

    private static async Task ApplyMigrations(
        string nodePath,
        string prismaCli,
        string serverDirectory,
        string dataDirectory)
    {
        var startInfo = new ProcessStartInfo(nodePath)
        {
            WorkingDirectory = serverDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        startInfo.ArgumentList.Add(prismaCli);
        startInfo.ArgumentList.Add("migrate");
        startInfo.ArgumentList.Add("deploy");
        startInfo.ArgumentList.Add("--schema");
        startInfo.ArgumentList.Add(Path.Combine(serverDirectory, "prisma", "schema.prisma"));
        startInfo.Environment["APP_DATA_DIR"] = dataDirectory;
        startInfo.Environment.Remove("DATABASE_URL");

        using var migration = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Não foi possível iniciar as migrações do banco.");
        var standardOutput = migration.StandardOutput.ReadToEndAsync();
        var standardError = migration.StandardError.ReadToEndAsync();
        await migration.WaitForExitAsync();
        var output = $"{await standardOutput}\n{await standardError}".Trim();

        if (migration.ExitCode != 0)
        {
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(output)
                    ? $"As migrações do banco falharam (código {migration.ExitCode})."
                    : $"As migrações do banco falharam:\n{output}");
        }
    }

    private static async Task<bool> WaitForApplication(Process server)
    {
        var deadline = DateTime.UtcNow.AddSeconds(30);
        while (DateTime.UtcNow < deadline)
        {
            if (server.HasExited)
            {
                throw new InvalidOperationException(
                    $"O servidor encerrou durante a inicialização (código {server.ExitCode}).");
            }

            if (await IsApplicationRunning())
            {
                return true;
            }

            await Task.Delay(300);
        }

        return false;
    }

    private static async Task<bool> IsApplicationRunning()
    {
        try
        {
            using var response = await Http.GetAsync(HealthUrl);
            if (!response.IsSuccessStatusCode)
            {
                return false;
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return document.RootElement.TryGetProperty("status", out var status) &&
                status.GetString() == "ok" &&
                document.RootElement.TryGetProperty("mensagem", out var message) &&
                message.GetString() == "API do Sorteio dos Servidores funcionando!";
        }
        catch (HttpRequestException)
        {
            return false;
        }
        catch (TaskCanceledException)
        {
            return false;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private static void OpenBrowser()
    {
        Process.Start(new ProcessStartInfo($"http://127.0.0.1:{Port}/")
        {
            UseShellExecute = true,
        });
    }

    private static void CreateDesktopShortcut(string applicationDirectory)
    {
        var shortcutPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            "Dia do Servidor.lnk");
        var launcherPath = Environment.ProcessPath
            ?? throw new InvalidOperationException("Não foi possível localizar o inicializador.");
        var shellType = Type.GetTypeFromProgID("WScript.Shell")
            ?? throw new InvalidOperationException("Não foi possível criar o atalho do sistema.");
        dynamic shell = Activator.CreateInstance(shellType)
            ?? throw new InvalidOperationException("Não foi possível criar o atalho do sistema.");
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = launcherPath;
        shortcut.WorkingDirectory = applicationDirectory;
        shortcut.Description = "Iniciar o sistema Dia do Servidor";
        shortcut.Save();
        Marshal.FinalReleaseComObject(shortcut);
        Marshal.FinalReleaseComObject(shell);
    }

    private static void ShowMessage(string text, string title, uint type)
    {
        MessageBoxW(IntPtr.Zero, text, title, type);
    }
}
