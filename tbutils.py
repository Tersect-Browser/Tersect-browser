import os
import random

from hashids import Hashids

def abspath(path):
    return os.path.abspath(os.path.expanduser(os.path.expandvars(path)))

def randomHash(salt='', max_id=1000000000000):
    hashids = Hashids(salt=salt)
    return hashids.encode(random.randint(0, max_id))
