using System.Diagnostics;
using System.Net.Http;
using System.Text;

const string scriptRef = "cfa31a3ddf603562be8cc1b011ae348ddde18f59";
const string repo = "thiagopantoja0911-netizen/media-forge";
const string desktopPath = "desktop";
string tempDir = Path.Combine(Path.GetTempPath(), "MediaForge-Worker-Updater-" + Guid.NewGuid().ToString("N"));

Console.OutputEncoding = Encoding.UTF8;
Console.WriteLine("=====================================================");
Console.WriteLine(" MEDIAFORGE - ATUALIZADOR DO WORKER");
Console.WriteLine(" Atualiza o Worker e reenfileira os renders recuperaveis");
Console.WriteLine("=====================================================");
Console.WriteLine();

try
{
    Directory.CreateDirectory(tempDir);
    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };

    foreach (var file in new[] { "update-and-retry.ps1", "update-worker-auto.ps1" })
    {
        var url = $"https://raw.githubusercontent.com/{repo}/{scriptRef}/{desktopPath}/{file}";
        Console.WriteLine("Baixando " + file + "...");
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        var destination = Path.Combine(tempDir, file);
        await using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await response.Content.CopyToAsync(output);
    }

    var script = Path.Combine(tempDir, "update-and-retry.ps1");
    var systemPowerShell = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.System),
        "WindowsPowerShell", "v1.0", "powershell.exe"
    );
    var executable = File.Exists(systemPowerShell) ? systemPowerShell : "powershell.exe";

    var start = new ProcessStartInfo
    {
        FileName = executable,
        WorkingDirectory = tempDir,
        UseShellExecute = false,
        CreateNoWindow = false
    };
    start.ArgumentList.Add("-NoLogo");
    start.ArgumentList.Add("-NoProfile");
    start.ArgumentList.Add("-ExecutionPolicy");
    start.ArgumentList.Add("Bypass");
    start.ArgumentList.Add("-File");
    start.ArgumentList.Add(script);

    Console.WriteLine();
    Console.WriteLine("Iniciando atualizacao segura e reprocessamento...");
    using var process = Process.Start(start) ?? throw new InvalidOperationException("Nao foi possivel iniciar o Windows PowerShell.");
    await process.WaitForExitAsync();

    Console.WriteLine();
    Console.WriteLine(process.ExitCode == 0
        ? "OPERACAO CONCLUIDA. Confira os novos jobs no MediaForge."
        : "OPERACAO NAO CONCLUIDA. Consulte a mensagem acima; os renders nao foram reenfileirados sem novo heartbeat.");
    WaitForKey();
    return process.ExitCode;
}
catch (Exception error)
{
    Console.Error.WriteLine();
    Console.Error.WriteLine("FALHA NO ATUALIZADOR: " + error.Message);
    Console.Error.WriteLine("Nenhuma credencial foi exibida ou enviada ao GitHub.");
    WaitForKey();
    return 1;
}
finally
{
    try { Directory.Delete(tempDir, recursive: true); } catch { }
}

static void WaitForKey()
{
    if (!Console.IsInputRedirected)
    {
        Console.WriteLine();
        Console.WriteLine("Pressione qualquer tecla para fechar.");
        Console.ReadKey(intercept: true);
    }
}
