const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

function reactResolve(specifier) {
  return require.resolve(specifier, { paths: [projectRoot] });
}

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react') {
    return { filePath: reactResolve('react'), type: 'sourceFile' };
  }
  if (moduleName === 'react/jsx-runtime') {
    return { filePath: reactResolve('react/jsx-runtime'), type: 'sourceFile' };
  }
  if (moduleName === 'react/jsx-dev-runtime') {
    return { filePath: reactResolve('react/jsx-dev-runtime'), type: 'sourceFile' };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver = {
  ...config.resolver,
  alias: {
    ...(config.resolver.alias || {}),
    react: path.dirname(reactResolve('react/package.json')),
  },
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    react: path.dirname(reactResolve('react/package.json')),
  },
  platforms: ['ios', 'android', 'native', 'web'],
  sourceExts: [...(config.resolver.sourceExts || []), 'ts', 'tsx', 'cjs'],
};

config.watchFolders = config.watchFolders || [];
config.watchFolders = config.watchFolders.filter(
  (folder) => !folder.includes('.zego-uikit-rn-') && !folder.includes('FQbFAhPG')
);

config.resolver.blacklistRE = /.*\/node_modules\/@zegocloud\/\.zego-uikit-rn-.*\/.*/;

module.exports = config;
