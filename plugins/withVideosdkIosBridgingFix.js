const {
  withDangerousMod,
  withXcodeProject,
  IOSConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const STATIC_DIR = path.join(__dirname, "static");

function copyVideosdkNativeFiles(iosAppDir) {
  fs.copyFileSync(
    path.join(STATIC_DIR, "VideosdkRPK.m"),
    path.join(iosAppDir, "VideosdkRPK.m")
  );

  const swiftPath = path.join(iosAppDir, "VideosdkRPK.swift");
  if (fs.existsSync(swiftPath)) {
    fs.unlinkSync(swiftPath);
  }
}

function withVideosdkIosBridgingFix(config) {
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appName =
        config.modRequest.projectName ||
        IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const iosAppDir = path.join(projectRoot, "ios", appName);
      fs.mkdirSync(iosAppDir, { recursive: true });
      copyVideosdkNativeFiles(iosAppDir);
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const appName = IOSConfig.XcodeUtils.getProjectName(
      config.modRequest.projectRoot
    );
    const mainTarget = project.getFirstTarget();
    if (!mainTarget) return config;

    const allGroups = project.hash.project.objects.PBXGroup;
    const groupUUID = Object.entries(allGroups).find(
      ([, group]) => group.name === appName || group.path === appName
    )?.[0];

    if (groupUUID) {
      const mPath = `${appName}/VideosdkRPK.m`;
      if (!project.hasFile(mPath)) {
        project.addSourceFile(mPath, { target: mainTarget.uuid }, groupUUID);
      }
    }

    return config;
  });

  return config;
}

module.exports = withVideosdkIosBridgingFix;
