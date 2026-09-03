using System.Collections;

namespace Synapse_Sample;

/// <summary>
/// A fixed-length ring of recent speed samples, oldest first. It never allocates while sampling,
/// which matters because every downloading row pushes one sample per second.
/// </summary>
public sealed class SpeedHistoryBuffer : IReadOnlyList<double>
{
    private readonly double[] _samples;
    private int _next;

    public SpeedHistoryBuffer(int capacity) => _samples = new double[capacity];

    public int Count => _samples.Length;

    /// <summary>The largest sample present. Zero when the ring is still empty.</summary>
    public double Peak { get; private set; }

    public double this[int index] => _samples[(_next + index) % _samples.Length];

    public void Push(double sample)
    {
        _samples[_next] = sample;
        _next = (_next + 1) % _samples.Length;

        // A dropped peak has to be recomputed, otherwise the sparkline stays scaled to a spike
        // that has already left the window.
        double peak = 0;
        for (int i = 0; i < _samples.Length; i++)
        {
            if (_samples[i] > peak)
            {
                peak = _samples[i];
            }
        }

        Peak = peak;
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
