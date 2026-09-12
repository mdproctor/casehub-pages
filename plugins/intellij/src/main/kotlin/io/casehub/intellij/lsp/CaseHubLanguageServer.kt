package io.casehub.intellij.lsp

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.server.OSProcessStreamConnectionProvider
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

class CaseHubLanguageServer(private val project: Project) : OSProcessStreamConnectionProvider() {

    init {
        val node = findNode()
            ?: throw IllegalStateException(
                "Node.js not found. Install Node.js 18+ and ensure it is on PATH, " +
                "or place it in /usr/local/bin or /opt/homebrew/bin."
            )

        val serverPath = extractServer()

        val commandLine = GeneralCommandLine(node, serverPath.toString(), "--stdio")
            .withCharset(Charsets.UTF_8)
            .withWorkDirectory(project.basePath)
        setCommandLine(commandLine)
    }

    private fun findNode(): String? {
        val isWin = System.getProperty("os.name").lowercase().contains("win")
        val names = if (isWin) listOf("node.exe") else listOf("node")

        val pathDirs = (System.getenv("PATH")?.split(File.pathSeparator) ?: emptyList())
            .toMutableList()

        if (!isWin) {
            for (fallback in listOf("/usr/local/bin", "/opt/homebrew/bin", "/opt/homebrew/opt/node/bin")) {
                if (fallback !in pathDirs) pathDirs.add(fallback)
            }
        }

        for (dir in pathDirs) {
            for (name in names) {
                val f = File(dir, name)
                if (f.isFile && f.canExecute()) return f.absolutePath
            }
        }
        return null
    }

    private fun extractServer(): Path {
        val targetDir = Path.of(System.getProperty("java.io.tmpdir"), "casehub-lsp")
        val targetFile = targetDir.resolve("server-node.bundle.cjs")

        if (Files.exists(targetFile)) return targetFile

        val resource = javaClass.getResourceAsStream("/server/server-node.bundle.cjs")
            ?: throw IllegalStateException("CaseHub LSP server bundle not found in plugin resources.")

        Files.createDirectories(targetDir)
        resource.use { input ->
            Files.copy(input, targetFile, StandardCopyOption.REPLACE_EXISTING)
        }

        return targetFile
    }
}
