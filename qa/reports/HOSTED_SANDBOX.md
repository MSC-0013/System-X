# Hosted sandbox follow-up

## Targets and scope

- The supplied [PortSwigger Web Security Academy](https://portswigger.net/web-security) URL is the learning portal. It was opened for target discovery. The run used no personal Academy lab URL.
- [Postman Echo](https://learning.postman.com/docs/reference/developer-resources/echo-api/) is a published request test service. Each attempt made one System-X HTTPS POST, one direct echo verification of the synthetic JSON, and one Blackbox-X HTTPS GET. Each request used concurrency one. Those latencies are connectivity observations.
- [Automation Exercise](https://automationexercise.com/test_cases) publishes browser test steps for its hosted practice shop. Chrome used a fresh context per attempt and limited requests to the practice origin.

## Observations

- **Postman Echo, 10/10.** System-X recorded one completed HTTP 200 per attempt and excluded the outgoing request body from the saved configuration. A direct HTTPS echo independently returned the provided JSON. Blackbox-X recorded one positive latency sample per attempt. Each batch correlated the sample and actual echoed JSON by ID. Three independent Quorum Lab nodes received the same evidence bytes, and a killed node recovered those bytes on restart. [HTTP observations](runs/2026-11-15T14-12-43-522Z-f3527a53/hosted/01/observations.json) · [JSON evidence](runs/2026-11-15T14-12-43-522Z-f3527a53/hosted/01/hosted-evidence.json) · [Quorum process evidence](runs/2026-11-15T14-12-43-522Z-f3527a53/hosted/01/quorum-processes.json)
- **Practice shop search and product detail, 9/10.** Chrome found the exact matching Blue Top and opened its detail page on nine runs. Attempt 9 timed out waiting for the site to finish navigation after the search click. The timeout and screenshots are retained. [Successful screenshot](runs/2026-11-15T14-14-18-446Z-853fa268/hosted-shop/01/hosted-product.png) · [Timeout](runs/2026-11-15T14-14-18-446Z-853fa268/hosted-shop/09/observations.json)
- **Practice shop cart, 6/10.** Six independent Chrome sessions added two units, checked the displayed quantity, removed the item, and verified an empty cart. One run timed out opening the product page, and three failed waiting for the row to disappear after clicking remove. [Cart screenshot](runs/2026-11-15T14-27-56-891Z-6caa6ab9/hosted-cart/07/hosted-cart.png) · [Ten-run records](runs/2026-11-15T14-27-56-891Z-6caa6ab9/hosted-cart/)

The hosted Echo lane exercises three real integrations linked by one evidence record. The public practice shop exercises its own catalog and cart UI. Internal calibration, Raft, tenant, fault semantics, and retained certificates still require control over the three-project test environment.

## Calibration follow-up

Blackbox-X M6 uses ten predetermined windows with five alternating training and five alternating held-out assignments. Each partition measured 2,000 successful requests in the healthy local QA sandbox per attempt. The model and search bounds still use only the training partition. The output records per-window p50, p99, and throughput to expose timing variability. Existing gate thresholds were retained.

The isolated M6 retest passed **6/10**, following 5/10 in the original Phase 3 regression. Attempts 05, 07, and 08 did not improve held-out MAPE relative to the original gate's uncalibrated training reference. Attempt 06 missed the 30% held-out cap at 30.23%. [Ten-run M6 batch](runs/2026-11-15T14-17-03-754Z-1735c4d2/M6/)

The independent ten-attempt M12 retest passed **9/10**, following 1/10 in the original Phase 3 regression. Attempt 03 failed its nested M6 check. The final held-out MAPE was 28.58%, above that attempt's 28.15% uncalibrated training reference. The gate thresholds were unchanged. [Ten-run M12 batch](runs/2026-11-15T14-19-50-035Z-b3933532/M12/)
