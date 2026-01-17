def chunked(iterable, size=1000):
    """
    Yield successive chunks from a list.

    Example:
        chunked([1,2,3,4,5], size=2)
        -> [1,2], [3,4], [5]
    """
    for i in range(0, len(iterable), size):
        yield iterable[i:i + size]
