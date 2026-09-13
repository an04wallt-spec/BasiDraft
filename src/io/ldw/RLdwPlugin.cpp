#include "RLdwPlugin.h"

#include "RLdwImporterFactory.h"

bool RLdwPlugin::init() {
    RLdwImporterFactory::registerFileImporter();
    return true;
}

RPluginInfo RLdwPlugin::getPluginInfo() {
    RPluginInfo info;
    info.set("Version", "0.1");
    info.set("ID", "BasiDraftLDW");
    info.set("Name", "BasiDraft LDW");
    info.set("Description", "Import support for BAZIS LDW drawings.");
    info.set("License", "GPLv3+");
    info.set("URL", "https://github.com/an04wallt-spec/BasiDraft");
    return info;
}
