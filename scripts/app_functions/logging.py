from datetime import datetime

def log_entry(request, action):
    user_ip = request.remote_addr
    timestamp = datetime.now()   

    print(f"User {user_ip} is {action} at {timestamp}")