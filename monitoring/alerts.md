# Alerts of production (workspace spec 103, D9)

The rules live in [`alerts/rmu-rules.yaml`](alerts/rmu-rules.yaml) (Prometheus format). They are loaded into the
ruler of the Grafana Cloud stack, and Grafana Cloud sends the notifications by email.

## Set up once

1. **Contact point:** in Grafana Cloud, *Alerting → Contact points*, edit the default one (email) with your address.
   *Notification policies* sends everything to it; rules with `severity=critical` can repeat every hour.
2. **Rules:** create an access policy token with `rules:read` and `rules:write`, then:

   ```bash
   docker run --rm -v "$PWD/monitoring/alerts:/r" grafana/mimirtool:2.17.0 rules load /r/rmu-rules.yaml \
     --address=https://prometheus-<region>.grafana.net/api/prom --id=<Prometheus user> --key=<token>
   ```

   They appear under *Alerting → Alert rules*, as "data source-managed" rules. Load them again after changing the
   file: the load replaces the groups with the same name.
3. **Synthetic Monitoring** (*Testing & synthetics → Synthetics*), two HTTP checks from outside the server. The job
   names must start with `rmu-`, because the rules `RmuSiteDown` and `RmuCertificateExpiring` filter on them:

   | Job | Target | Frequency | Probes |
   |---|---|---|---|
   | `rmu-web` | `https://rmu.labcabrera.com/` | 2 min | 2, in Europe |
   | `rmu-api` | `https://rmu.labcabrera.com/api/core/v1/health` | 2 min | 2, in Europe |

   With these numbers both checks make about 86,000 executions a month, under the 100,000 of the free plan
   (confirm the limit in the account). The TLS metrics of the checks feed the certificate alert.
4. **Dashboard:** *Dashboards → New → Import*, upload [`dashboards/rmu-overview.json`](dashboards/rmu-overview.json)
   and pick the stack's Prometheus and Loki data sources.

## The rules

| Alert | Fires when | Severity |
|---|---|---|
| `RmuSiteDown` | No probe reaches the web or the API health for 5 min | critical |
| `RmuMonitoringSilent` | No host metrics for 10 min: the server or `rmu-alloy` is down | critical |
| `RmuBackupMissing` | No successful nightly backup in 26 h (`rmu_backup_*`, written by `scripts/prod-backup.sh`) | critical |
| `RmuDiskFull` | Disk `/` above 80 % for 15 min | warning |
| `RmuMemoryLow` | Less than 10 % memory available for 10 min | warning |
| `RmuContainerRestarting` | A container started twice or more in 30 min (one start is a deploy) | warning |
| `RmuContainerOutOfMemory` | A container hit its `mem_limit` | warning |
| `RmuServerErrors` | More than 5 % of the requests answer 5xx for 10 min, with some traffic | warning |
| `RmuCertificateExpiring` | The certificate expires in less than 14 days (Caddy renews at 30) | warning |

## What to do

- **Site down:** `make prod-ps`, then `make prod-logs s=<service>`. If the host does not answer, use the OVH console (KVM).
- **Monitoring silent but the site works:** `make prod-up s=rmu-alloy`, then `make prod-logs s=rmu-alloy`.
- **Backup missing:** `tail /var/log/rmu-backup.log` on the server, run `make prod-backup-nightly` by hand.
- **Disk full:** `docker system df`; `docker image prune -a` removes the images of old versions; the dumps in
  `backups/` (the nightly folder is overwritten every night, `restore-*` folders are left by restores).
- **Memory low or out of memory:** the *Memory against the limit* table of the dashboard shows who grows. Limits are
  in `compose/production.yaml`.
- **Certificate expiring:** `make prod-logs s=rmu-gateway` and look for `acme` errors (DNS, port 80 closed).
