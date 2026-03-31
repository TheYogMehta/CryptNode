import { useState, useEffect } from "react";
import { localAIService } from "../../../services/ai/localAI.service";

export const useAIStatus = (trackProgress = true) => {
  const [isLoaded, setIsLoaded] = useState(localAIService.isLoaded);
  const [isLoading, setIsLoading] = useState(localAIService.isLoading);
  const [progress, setProgress] = useState(trackProgress ? localAIService.downloadProgress : 0);
  const [isInstalled, setIsInstalled] = useState(false);
  const [hasFailed, setHasFailed] = useState(localAIService.failed);
  const [downloadInfo, setDownloadInfo] = useState(trackProgress ? localAIService.downloadInfo : null);

  useEffect(() => {
    setIsLoaded(localAIService.isLoaded);
    setIsLoading(localAIService.isLoading);
    setHasFailed(localAIService.failed);
    if (trackProgress) {
        setProgress(localAIService.downloadProgress);
        setDownloadInfo(localAIService.downloadInfo);
    }

    localAIService.isModelInstalled().then(setIsInstalled);

    const unsubscribe = localAIService.subscribe(() => {
      setIsLoaded(localAIService.isLoaded);
      setIsLoading(localAIService.isLoading);
      setHasFailed(localAIService.failed);
      if (trackProgress) {
          setProgress(localAIService.downloadProgress);
          setDownloadInfo(localAIService.downloadInfo);
      }
      localAIService.isModelInstalled().then(setIsInstalled);
    });

    return unsubscribe;
  }, [trackProgress]);

  return { isLoaded, isLoading, progress, isInstalled, hasFailed, downloadInfo };
};
