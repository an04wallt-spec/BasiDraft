#pragma once

#include <QtCore/QtGlobal>

#if defined(QCAD_DLL)
#   if defined(BASIDRAFTLDW_LIBRARY)
#       define BASIDRAFTLDW_EXPORT Q_DECL_EXPORT
#   else
#       define BASIDRAFTLDW_EXPORT Q_DECL_IMPORT
#   endif
#else
#   define BASIDRAFTLDW_EXPORT
#endif
