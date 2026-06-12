const connectionStatus = document.querySelector("#connectionStatus");

fetch("/api/health")
  .then((response) => response.json())
  .then(() => {
    connectionStatus.textContent = "Online";
  })
  .catch(() => {
    connectionStatus.textContent = "Offline";
  });
