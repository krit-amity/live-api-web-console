export const sessionConfigData = {
  agent_name: "Jane",
  agent_id: "90012345",
  client_id: "C123456789",
  call_date: "2025-05-28",
  service_type: "TrueOnline"
}

export const clientData = `
      "id": "C001",
      "nickname": "Mike",
      "firstname": "Michael",
      "lastname": "Johnson",
      "age": 36,
      "sex": "Male",
      "services": {
        "TruemoveH": {
          "monthly_plan": [
            {
              "phone_number": "0991234567",
              "package": {
                "name": "Standard",
                "price": 399,
                "price_include_tax": 426.93,
                "speed": "10 Mbps",
                "data_amount": "50 GB",
                "phone_call_free": "100 minutes",
                "phone_call_fees": "2 bath per minute",
                "sms_fees": "3 bath per message",
                "mms_fees": "5 bath per message"
              },
              "billing": [
                {
                  "bill_id": 8901,
                  "date": "2025-04-26",
                  "amount_due": 426.93,
                  "due_date": "2025-04-29",
                  "status": "Paid"
                }
              ]
            }
          ],
          "topup_plan": []
        }
`