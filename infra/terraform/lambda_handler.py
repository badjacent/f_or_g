def handler(event, context):
    return {
        "statusCode": 503,
        "headers": {"content-type": "application/json"},
        "body": '{"status":"deploy pending"}',
    }
