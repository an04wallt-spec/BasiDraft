#pragma once

#include <QObject>

#include "RPluginInterface.h"

class RLdwPlugin : public QObject, public RPluginInterface {
    Q_OBJECT
    Q_INTERFACES(RPluginInterface)
#if QT_VERSION >= 0x050000
    Q_PLUGIN_METADATA(IID "org.basidraft.ldw")
#endif

public:
    bool init() override;
    void uninit(bool) override {}
    void postInit(InitStatus) override {}
#if QT_VERSION < 0x060000
    void initScriptExtensions(QScriptEngine&) override {}
#endif
    void initTranslations() override {}
    RPluginInfo getPluginInfo() override;
    bool checkLicense() override { return true; }
};
