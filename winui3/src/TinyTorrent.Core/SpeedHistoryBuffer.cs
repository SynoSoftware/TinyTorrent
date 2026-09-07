using System.Collections;

namespace TinyTorrent;

/// <summary>
/// A fixed-length ring of recent speed samples, oldest first. It never allocates while sampling,
/// which matters because every row records one sample per tick.
/// </summary>
public sealed class SpeedHistoryBuffer : IReadOnlyList<double>
{
    private readonly double[] _samples;
    private int _next;
    private double? _peak;

    public SpeedHistoryBuffer(int capacity) => _samples = new double[capacity];

    public int Count => _samples.Length;

    /// <summary>The largest sample present. Zero when the ring is still empty.</summary>
    /// <remarks>
    /// A dropped peak has to be rescanned rather than folded in, otherwise the sparkline stays
    /// scaled to a spike that has already left the window. The rescan runs when the value is read
    /// and not when a sample arrives, because only a realized sparkline ever reads it: a 2,000-row
    /// list records 2,000 samples a tick, so scanning on push cost 32 comparisons for each of them.
    /// </remarks>
    public double Peak
    {
        get
        {
            if (_peak is double known)
            {
                return known;
            }

            double peak = 0;
            foreach (double sample in _samples)
            {
                if (sample > peak)
                {
                    peak = sample;
                }
            }

            _peak = peak;
            return peak;
        }
    }

    public double this[int index] => _samples[(_next + index) % _samples.Length];

    public void Push(double sample)
    {
        _samples[_next] = sample;
        _next = (_next + 1) % _samples.Length;
        _peak = null;
    }

    public IEnumerator<double> GetEnumerator()
    {
        for (int i = 0; i < _samples.Length; i++)
        {
            yield return this[i];
        }
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}
