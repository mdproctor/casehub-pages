plugins {
    id("org.jetbrains.kotlin.jvm") version "2.1.21"
    id("org.jetbrains.intellij.platform")
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity(providers.gradleProperty("platformVersion").get())
        plugin("com.redhat.devtools.lsp4ij", providers.gradleProperty("lsp4ijVersion").get())
    }
}

kotlin {
    jvmToolchain(21)
}

intellijPlatform {
    pluginConfiguration {
        id = "io.casehub.pages"
        name = providers.gradleProperty("pluginName")
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = "242"
        }
    }

    pluginVerification {
        ides {
            recommended()
        }
    }
}

val copyServerBundle = tasks.register<Copy>("copyServerBundle") {
    from("../../packages/pages-lsp/dist/server-node.bundle.cjs")
    into(layout.buildDirectory.dir("resources/main/server"))
}

tasks.named("processResources") {
    dependsOn(copyServerBundle)
}
