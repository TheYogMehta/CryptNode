import { useState, useEffect } from "react";
import { qwenLocalService } from "../../../services/ai/qwenLocal.service";

export const useAIStatus = () => {
  const [isLoaded, setIsLoaded] = useState(qwenLocalService.isLoaded);
  const [isLoading, setIsLoading] = useState(qwenLocalService.isLoading);
  const [progress, setProgress] = useState(qwenLocalService.downloadProgress);
  const [isInstalled, setIsInstalled] = useState(false);
  const [hasFailed, setHasFailed] = useState(qwenLocalService.failed);
  const [installedSize, setInstalledSize] = useState(qwenLocalService.installedSize);
  const [requiredSize, setRequiredSize] = useState(qwenLocalService.requiredSize);
  const [downloadedBytes, setDownloadedBytes] = useState(qwenLocalService.downloadedBytes);

  useEffect(() => {
    setIsLoaded(qwenLocalService.isLoaded);
    setIsLoading(qwenLocalService.isLoading);
    setProgress(qwenLocalService.downloadProgress);
    setHasFailed(qwenLocalService.failed);
    setInstalledSize(qwenLocalService.installedSize);
    setRequiredSize(qwenLocalService.requiredSize);
    setDownloadedBytes(qwenLocalService.downloadedBytes);

    qwenLocalService.isModelInstalled().then(setIsInstalled);

    const unsubscribe = qwenLocalService.subscribe(() => {
      setIsLoaded(qwenLocalService.isLoaded);
      setIsLoading(qwenLocalService.isLoading);
      setProgress(qwenLocalService.downloadProgress);
      setHasFailed(qwenLocalService.failed);
      setInstalledSize(qwenLocalService.installedSize);
      setRequiredSize(qwenLocalService.requiredSize);
      setDownloadedBytes(qwenLocalService.downloadedBytes);
      qwenLocalService.isModelInstalled().then(setIsInstalled);
    });

    return unsubscribe;
  }, []);

  return { isLoaded, isLoading, progress, isInstalled, hasFailed, installedSize, requiredSize, downloadedBytes };
};
