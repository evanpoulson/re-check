"""Print the backend contract as one JSON Schema document.

Run through uv from `web/` (see gen-contract.mjs). It reads the Pydantic models
in api/src/recheck/contract, so the frontend types always match the backend.
"""

import json
import sys

from recheck.contract import contract_json_schema, patient_report_adapter

schema = contract_json_schema()
defs = dict(schema["$defs"])

report = patient_report_adapter.json_schema(ref_template="#/$defs/{model}")
defs.update(report.pop("$defs", {}))

root = {
    "title": "Contract",
    "type": "object",
    "additionalProperties": False,
    "properties": {name: {"$ref": f"#/$defs/{name}"} for name in sorted(defs)},
    "$defs": defs,
}
root["$defs"]["PatientReport"] = report
root["properties"]["PatientReport"] = {"$ref": "#/$defs/PatientReport"}
root["properties"] = dict(sorted(root["properties"].items()))

sys.stdout.write(json.dumps(root, indent=2, sort_keys=True) + "\n")
